import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const backend = import.meta.env.VITE_BACKEND_URL || "";

function App() {
  const [phone, setPhone] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [otpSent, setOtpSent] = React.useState(false);
  const [otpVerified, setOtpVerified] = React.useState(false);
  const [status, setStatus] = React.useState("Ready");
  const [busy, setBusy] = React.useState(false);

  async function callApi(path, body) {
    const response = await fetch(`${backend}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }

    return data;
  }

  async function sendOtp() {
    setBusy(true);
    setStatus("Sending OTP...");
    try {
      const data = await callApi("/auth/send-otp", { phone });
      setOtpSent(true);
      setOtpVerified(false);
      setStatus(`OTP sent to ${data.to}`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setBusy(true);
    setStatus("Verifying OTP...");
    try {
      const data = await callApi("/auth/verify-otp", { phone, code: otp });

      if (!data.valid) {
        throw new Error("Invalid OTP. Please try again.");
      }

      setOtpVerified(true);
      setStatus("Phone verified successfully");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function checkBackend() {
    setStatus("Checking backend...");
    try {
      const response = await fetch(`${backend}/health`);
      if (!response.ok) throw new Error("backend error");
      const data = await response.json();
      setStatus(
        data.status === "ok"
          ? `Backend is healthy • Twilio: ${data.twilioConfigured ? "configured" : "not configured"}`
          : "Backend responded"
      );
    } catch {
      setStatus("Backend connection failed");
    }
  }

  function signIn() {
    setStatus(
      otpVerified
        ? "OTP verified. Identity Platform password login will be added next."
        : "For first registration, verify the phone with OTP first."
    );
  }

  return (
    <main className="page">
      <section className="card">
        <div className="brand">Identity Platform</div>
        <h1>Phone + Password</h1>
        <p className="subtitle">Tenant-aware authentication POC</p>

        <label htmlFor="phone">Phone number</label>
        <div className="row">
          <input
            id="phone"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+91 9876543210"
            inputMode="tel"
          />
          <button type="button" onClick={sendOtp} disabled={busy || !phone}>
            Send OTP
          </button>
        </div>

        {otpSent && (
          <>
            <label htmlFor="otp">OTP</label>
            <div className="row">
              <input
                id="otp"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                placeholder="6-digit OTP"
                inputMode="numeric"
                maxLength={10}
              />
              <button type="button" onClick={verifyOtp} disabled={busy || !otp}>
                Verify OTP
              </button>
            </div>
          </>
        )}

        <label htmlFor="password">Password</label>
        <input
          id="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          type="password"
          placeholder="••••••••"
        />

        <button type="button" onClick={signIn} disabled={busy}>
          {otpVerified ? "Continue" : "Sign in"}
        </button>

        <button type="button" className="secondary" onClick={checkBackend}>
          Check backend
        </button>

        <div className="status">{status}</div>

        <small>
          Twilio SMS OTP is enabled for the POC. Identity Platform tenant
          registration and password login are the next phase.
        </small>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
