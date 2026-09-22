import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import twilio from "twilio";

const app = express();
const port = Number(process.env.PORT || 8080);

if (!getApps().length) initializeApp();

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN
    ? process.env.FRONTEND_ORIGIN.split(",").map(v => v.trim())
    : true
}));
app.use(express.json());

const tenantId = process.env.IDENTITY_PLATFORM_TENANT_ID || "";
const identityPlatformApiKey = process.env.IDENTITY_PLATFORM_API_KEY || "";
const otpSessionSecret = process.env.OTP_SESSION_SECRET || "";

const twilioConfigured = Boolean(
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_VERIFY_SERVICE_SID
);

const twilioClient = twilioConfigured
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

function normalizePhone(value) {
  const raw = String(value || "").trim().replace(/[\s()-]/g, "");

  if (/^\+91\d{10}$/.test(raw)) return raw;
  if (/^91\d{10}$/.test(raw)) return `+${raw}`;
  if (/^\d{10}$/.test(raw)) return `+91${raw}`;

  throw new Error("Enter a valid Indian phone number, for example +919876543210");
}

function phoneToInternalEmail(phone) {
  const digest = crypto.createHash("sha256").update(phone).digest("hex");
  return `phone-${digest}@identity-provider.invalid`;
}

function createOtpSession(phone) {
  if (!otpSessionSecret) {
    throw new Error("OTP session signing secret is not configured");
  }

  const payload = {
    phone,
    exp: Date.now() + 10 * 60 * 1000
  };

  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", otpSessionSecret)
    .update(encoded)
    .digest("base64url");

  return `${encoded}.${signature}`;
}

function verifyOtpSession(token, expectedPhone) {
  if (!otpSessionSecret || !token) return false;

  const [encoded, signature] = String(token).split(".");
  if (!encoded || !signature) return false;

  const expectedSignature = crypto
    .createHmac("sha256", otpSessionSecret)
    .update(encoded)
    .digest("base64url");

  if (
    signature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    );

    return (
      payload.phone === expectedPhone &&
      Number(payload.exp) > Date.now()
    );
  } catch {
    return false;
  }
}

async function identityPlatformPasswordSignIn(email, password) {
  if (!identityPlatformApiKey) {
    throw new Error("Identity Platform API key is not configured");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(identityPlatformApiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
        tenantId
      })
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const code = data?.error?.message || "IDENTITY_PLATFORM_LOGIN_FAILED";
    throw new Error(code);
  }

  return data;
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "identity-provider-backend",
    environment: process.env.NODE_ENV || "development",
    twilioConfigured,
    identityPlatformConfigured: Boolean(
      tenantId && identityPlatformApiKey && otpSessionSecret
    ),
    tenantId: tenantId || null
  });
});

app.get("/", (_req, res) => {
  res.json({
    service: "identity-provider-backend",
    message: "Phone + password authentication API"
  });
});

app.post("/auth/send-otp", async (req, res) => {
  try {
    if (!twilioClient) {
      return res.status(503).json({
        error: "Twilio is not configured on the backend"
      });
    }

    const to = normalizePhone(req.body?.phone);

    const verification = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({
        to,
        channel: "sms"
      });

    return res.json({
      success: true,
      status: verification.status,
      to
    });
  } catch (error) {
    console.error("send-otp failed:", error.message);
    return res.status(400).json({
      error: error.message || "Unable to send OTP"
    });
  }
});

app.post("/auth/verify-otp", async (req, res) => {
  try {
    if (!twilioClient) {
      return res.status(503).json({
        error: "Twilio is not configured on the backend"
      });
    }

    const to = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || "").trim();

    if (!/^\d{4,10}$/.test(code)) {
      return res.status(400).json({
        error: "Enter the OTP you received"
      });
    }

    const check = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({
        to,
        code
      });

    if (check.status !== "approved" || check.valid !== true) {
      return res.status(400).json({
        success: false,
        status: check.status,
        valid: false,
        error: "Invalid OTP. Please try again."
      });
    }

    return res.json({
      success: true,
      status: check.status,
      valid: true,
      otpToken: createOtpSession(to)
    });
  } catch (error) {
    console.error("verify-otp failed:", error.message);
    return res.status(400).json({
      error: error.message || "Unable to verify OTP"
    });
  }
});

app.post("/auth/register", async (req, res) => {
  try {
    if (!tenantId) {
      return res.status(503).json({ error: "Identity Platform tenant is not configured" });
    }

    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || "");
    const otpToken = String(req.body?.otpToken || "");

    if (!verifyOtpSession(otpToken, phone)) {
      return res.status(401).json({
        error: "Phone verification has expired. Please verify the OTP again."
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters."
      });
    }

    const tenantAuth = getAuth().tenantManager().authForTenant(tenantId);
    const email = phoneToInternalEmail(phone);

    try {
      await tenantAuth.getUserByPhoneNumber(phone);
      return res.status(409).json({
        error: "An account already exists for this phone number. Please sign in."
      });
    } catch (error) {
      if (error.code !== "auth/user-not-found") throw error;
    }

    const user = await tenantAuth.createUser({
      email,
      password,
      phoneNumber: phone,
      phoneNumberVerified: true,
      disabled: false
    });

    const authResult = await identityPlatformPasswordSignIn(email, password);

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      uid: user.uid,
      tenantId: user.tenantId,
      idToken: authResult.idToken,
      refreshToken: authResult.refreshToken,
      expiresIn: authResult.expiresIn
    });
  } catch (error) {
    console.error("register failed:", error.message);
    return res.status(400).json({
      error: error.message || "Unable to create account"
    });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    if (!tenantId) {
      return res.status(503).json({ error: "Identity Platform tenant is not configured" });
    }

    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || "");

    if (!password) {
      return res.status(400).json({ error: "Enter your password." });
    }

    const tenantAuth = getAuth().tenantManager().authForTenant(tenantId);
    let user;

    try {
      user = await tenantAuth.getUserByPhoneNumber(phone);
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        return res.status(401).json({ error: "Invalid phone number or password." });
      }
      throw error;
    }

    const email = user.email;
    if (!email) {
      return res.status(401).json({ error: "This account is not configured for password sign-in." });
    }

    const authResult = await identityPlatformPasswordSignIn(email, password);

    return res.json({
      success: true,
      message: "Login successful",
      uid: authResult.localId,
      tenantId,
      idToken: authResult.idToken,
      refreshToken: authResult.refreshToken,
      expiresIn: authResult.expiresIn
    });
  } catch (error) {
    console.error("login failed:", error.message);

    const publicError =
      error.message === "INVALID_PASSWORD" ||
      error.message === "EMAIL_NOT_FOUND" ||
      error.message === "USER_DISABLED"
        ? "Invalid phone number or password."
        : error.message || "Unable to sign in";

    return res.status(401).json({ error: publicError });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Backend listening on port ${port}`);
});
