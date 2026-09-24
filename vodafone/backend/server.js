import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import admin from "firebase-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = Number(process.env.PORT || 8080);
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
const TENANT_ID = process.env.IDENTITY_PLATFORM_TENANT_ID || "India-p9rv0";
const OTP_PROVIDER = process.env.OTP_PROVIDER || "mock";

if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
const tenantAuth = admin.auth().tenantManager().authForTenant(TENANT_ID);

// Demo-only in-memory OTP state. Production must use a secure durable store
// or the Vodafone provider verification API, depending on the real contract.
const challenges = new Map();

function normalizePhone(input) {
  const value = String(input || "").replace(/[\\s()-]/g, "");
  if (/^0\\d{10}$/.test(value)) return "+91" + value.slice(1);
  if (/^\\d{10}$/.test(value)) return "+91" + value;
  if (/^\\+\\d{10,15}$/.test(value)) return value;
  throw new Error("Use a valid E.164 number or Indian 10-digit number.");
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

class MockSmsProvider {
  async sendOtp(phone) {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const challengeId = crypto.randomUUID();
    challenges.set(challengeId, {
      phone,
      otpHash: hashOtp(otp),
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
      used: false
    });
    console.log("[MOCK OTP] challengeId=" + challengeId + " otp=" + otp);
    return { challengeId };
  }

  async verifyOtp(challengeId, otp) {
    const challenge = challenges.get(challengeId);
    if (!challenge || challenge.used || challenge.expiresAt < Date.now()) return false;
    if (challenge.attempts >= 5) return false;
    challenge.attempts += 1;
    const valid = challenge.otpHash === hashOtp(String(otp));
    if (valid) challenge.used = true;
    return valid;
  }
}

class VodafoneSmsProvider {
  async sendOtp() {
    throw new Error("Vodafone adapter is a placeholder. Implement it only from the customer API contract.");
  }
  async verifyOtp() {
    throw new Error("Vodafone OTP verification is not implemented until the customer confirms the provider model.");
  }
}

const smsProvider = OTP_PROVIDER === "vodafone" ? new VodafoneSmsProvider() : new MockSmsProvider();

async function findOrCreateTenantUser(phone) {
  try {
    return await tenantAuth.getUserByPhoneNumber(phone);
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    return tenantAuth.createUser({ phoneNumber: phone, disabled: false });
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, provider: OTP_PROVIDER, tenantId: TENANT_ID });
});

app.post("/auth/otp/send", async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phoneNumber);
    const result = await smsProvider.sendOtp(phone);
    res.json({ ok: true, challengeId: result.challengeId, provider: OTP_PROVIDER });
  } catch (error) {
    console.error("OTP send failed:", error.message);
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/auth/otp/verify", async (req, res) => {
  try {
    const { challengeId, otp } = req.body;
    if (!challengeId || !otp) return res.status(400).json({ ok: false, error: "challengeId and otp are required" });

    const valid = await smsProvider.verifyOtp(challengeId, otp);
    if (!valid) return res.status(401).json({ ok: false, error: "Invalid or expired OTP" });

    const challenge = challenges.get(challengeId);
    const phone = challenge?.phone;
    if (!phone) return res.status(400).json({ ok: false, error: "OTP challenge has no phone" });

    const user = await findOrCreateTenantUser(phone);
    const customToken = await tenantAuth.createCustomToken(user.uid);

    res.json({ ok: true, phone, tenantId: TENANT_ID, uid: user.uid, customToken });
  } catch (error) {
    console.error("OTP verification failed:", error.message);
    res.status(500).json({ ok: false, error: "Authentication flow failed" });
  }
});

app.post("/auth/pin/verify", (_req, res) => {
  res.status(501).json({ ok: false, error: "PIN service is application-specific and is not implemented in this sample" });
});

app.listen(PORT, () => console.log("Vodafone/Identity Platform sample listening on " + PORT));
