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
  const [otpToken, setOtpToken] = React.useState("");
  const [mode, setMode] = React.useState("login");
  const [status, setStatus] = React.useState("Ready");
  const [busy, setBusy] = React.useState(false);
  const [screen, setScreen] = React.useState("auth");
  const [user, setUser] = React.useState(null);

  async function callApi(path, body) {
    const response = await fetch(`${backend}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setOtpSent(false);
    setOtpVerified(false);
    setOtpToken("");
    setOtp("");
    setPassword("");
    setStatus(nextMode === "register"
      ? "Enter your phone number to create an account."
      : "Enter your phone number and password to sign in.");
  }

  async function sendOtp() {
    setBusy(true);
    setStatus("Sending OTP...");
    try {
      const data = await callApi("/auth/send-otp", { phone });
      setOtpSent(true);
      setOtpVerified(false);
      setOtpToken("");
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
      if (!data.valid) throw new Error("Invalid OTP. Please try again.");
      setOtpVerified(true);
      setOtpToken(data.otpToken);
      setStatus("Phone verified successfully. Now create your password.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function register() {
    if (!otpVerified || !otpToken) {
      setStatus("Verify the phone with OTP first.");
      return;
    }
    setBusy(true);
    setStatus("Creating Identity Platform account...");
    try {
      const data = await callApi("/auth/register", { phone, password, otpToken });
      setOtpSent(false);
      setOtpVerified(false);
      setOtpToken("");
      setOtp("");
      setPassword("");
      setStatus(`Account created successfully. UID: ${data.uid}`);
      setScreen("registered");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    setBusy(true);
    setStatus("Signing in...");
    try {
      const data = await callApi("/auth/login", { phone, password });
      setUser({ phone, uid: data.uid, tenantId: data.tenantId });
      setStatus("Login successful");
      setScreen("dashboard");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  function continueToSignIn() {
    setScreen("auth");
    switchMode("login");
    setStatus("Account created. Sign in with your phone and password.");
  }

  function logout() {
    setUser(null);
    setPhone("");
    setPassword("");
    setOtp("");
    setOtpSent(false);
    setOtpVerified(false);
    setOtpToken("");
    setMode("login");
    setStatus("You have been signed out.");
    setScreen("auth");
  }

  async function checkBackend() {
    setStatus("Checking backend...");
    try {
      const response = await fetch(`${backend}/health`);
      if (!response.ok) throw new Error("backend error");
      const data = await response.json();
      setStatus(data.status === "ok"
        ? `Backend healthy • Twilio: ${data.twilioConfigured ? "configured" : "not configured"} • Identity Platform: ${data.identityPlatformConfigured ? "configured" : "not configured"}`
        : "Backend responded");
    } catch {
      setStatus("Backend connection failed");
    }
  }

  if (screen === "dashboard" && user) {
    return (
      <main className="page">
        <section className="card dashboard">
          <div className="brand">Identity Platform</div>
          <h1>Welcome 👋</h1>
          <p className="subtitle">You are successfully authenticated.</p>
          <div className="success-banner">✓ Login successful</div>
          <div className="info-card">
            <div className="info-row"><span>Authentication</span><strong>Password</strong></div>
            <div className="info-row"><span>Phone</span><strong>{user.phone}</strong></div>
            <div className="info-row"><span>Tenant</span><strong>{user.tenantId}</strong></div>
            <div className="info-row"><span>User ID</span><strong className="uid">{user.uid}</strong></div>
          </div>
          <button type="button" onClick={logout}>Logout</button>
          <small>OTP was used only during initial account registration. Returning users sign in with phone + password.</small>
        </section>
      </main>
    );
  }

  if (screen === "registered") {
    return (
      <main className="page">
        <section className="card">
          <div className="brand">Identity Platform</div>
          <div className="success-icon">✓</div>
          <h1>Account created</h1>
          <p className="subtitle">Your tenant account has been created successfully.</p>
          <div className="success-banner">Phone verified • Password created • Account ready</div>
          <button type="button" onClick={continueToSignIn}>Continue to sign in</button>
          <small>For future logins, you only need your phone number and password. OTP is not required again.</small>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <section className="card">
        <div className="brand">Identity Platform</div>
        <h1>{mode === "register" ? "Create account" : "Welcome back"}</h1>
        <p className="subtitle">{mode === "register" ? "Register with phone verification and a password." : "Sign in with your phone number and password."}</p>

        <div className="mode-switch">
          <button type="button" className={mode === "login" ? "mode active" : "mode"} onClick={() => switchMode("login")} disabled={busy}>Sign in</button>
          <button type="button" className={mode === "register" ? "mode active" : "mode"} onClick={() => switchMode("register")} disabled={busy}>Create account</button>
        </div>

        <label htmlFor="phone">Phone number</label>
        <input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 9876543210" inputMode="tel" />

        {mode === "register" && (
          <>
            <button type="button" onClick={sendOtp} disabled={busy || !phone}>Send OTP</button>
            {otpSent && (
              <>
                <label htmlFor="otp">OTP</label>
                <div className="row">
                  <input id="otp" value={otp} onChange={e => setOtp(e.target.value)} placeholder="6-digit OTP" inputMode="numeric" maxLength={10} />
                  <button type="button" onClick={verifyOtp} disabled={busy || !otp}>Verify OTP</button>
                </div>
              </>
            )}
          </>
        )}

        <label htmlFor="password">Password</label>
        <input id="password" value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••" />

        {mode === "register"
          ? <button type="button" onClick={register} disabled={busy || !otpVerified || password.length < 8}>Create account</button>
          : <button type="button" onClick={login} disabled={busy || !phone || !password}>Sign in</button>}

        <button type="button" className="secondary" onClick={checkBackend} disabled={busy}>Check backend</button>
        <div className="status">{status}</div>
        <small>Registration: phone → Twilio OTP → Identity Platform tenant account. Returning users: phone + password → Identity Platform.</small>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
