import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const backend = import.meta.env.VITE_BACKEND_URL || "";

function App() {
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [status, setStatus] = React.useState("Ready");

  async function checkBackend() {
    setStatus("Checking backend...");
    try {
      const response = await fetch(`${backend}/health`);
      if (!response.ok) throw new Error("backend error");
      const data = await response.json();
      setStatus(data.status === "ok" ? "Backend is healthy" : "Backend responded");
    } catch {
      setStatus("Backend connection failed");
    }
  }

  return (
    <main className="page">
      <section className="card">
        <div className="brand">Identity Platform</div>
        <h1>Phone + Password</h1>
        <p className="subtitle">Tenant-aware authentication POC</p>

        <label htmlFor="phone">Phone number</label>
        <input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91 9876543210" />

        <label htmlFor="password">Password</label>
        <input id="password" value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="••••••••" />

        <button type="button">Sign in</button>
        <button type="button" className="secondary" onClick={checkBackend}>Check backend</button>

        <div className="status">{status}</div>
        <small>OTP registration and Identity Platform tenant authentication will be enabled in the next phase.</small>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
