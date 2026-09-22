import express from "express";
import cors from "cors";
import { getApps, initializeApp } from "firebase-admin/app";
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

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "identity-provider-backend",
    environment: process.env.NODE_ENV || "development",
    twilioConfigured
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

    return res.json({
      success: check.status === "approved",
      status: check.status,
      valid: check.valid === true
    });
  } catch (error) {
    console.error("verify-otp failed:", error.message);
    return res.status(400).json({
      error: error.message || "Unable to verify OTP"
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Backend listening on port ${port}`);
});
