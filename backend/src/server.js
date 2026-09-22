import express from "express";
import cors from "cors";
import { getApps, initializeApp } from "firebase-admin/app";

const app = express();
const port = Number(process.env.PORT || 8080);

if (!getApps().length) initializeApp();

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN
    ? process.env.FRONTEND_ORIGIN.split(",").map(v => v.trim())
    : true
}));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "identity-provider-backend",
    environment: process.env.NODE_ENV || "development"
  });
});

app.get("/", (_req, res) => {
  res.json({
    service: "identity-provider-backend",
    message: "Phone + password authentication API",
    next: "Twilio OTP integration will be added after the deployment baseline is verified"
  });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Backend listening on port ${port}`);
});
