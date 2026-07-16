// Login page — accepts SRIT email OR personal alias, same password.
import { loginWithAnyEmail } from "../lib/auth.js";
import { toast, escapeHtml } from "../lib/ui.js";
import { ALLOWED_DOMAIN } from "../lib/firebase-config.js";

export async function renderLogin(el) {
  el.innerHTML = `
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-brand">
        <div class="bee">🐝</div>
        <h1>HIVE Events Tracker</h1>
        <p>Track every event you participate in — in one place.</p>
      </div>
      <form id="login-form">
        <div class="field">
          <label>Email</label>
          <input type="email" name="email" placeholder="you@${escapeHtml(ALLOWED_DOMAIN)} or personal alias" required autofocus />
          <span class="hint">You can sign in with your college email or your linked personal email.</span>
        </div>
        <div class="field">
          <label>Password</label>
          <input type="password" name="password" placeholder="••••••••" required />
        </div>
        <button class="btn btn-primary btn-block" type="submit" id="login-btn">Sign in</button>
      </form>
      <div class="auth-alt">New here? <a href="#/register">Create your account</a></div>
    </div>
  </div>`;

  el.querySelector("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = el.querySelector("#login-btn");
    btn.disabled = true; btn.textContent = "Signing in…";
    const { email, password } = Object.fromEntries(new FormData(e.target));
    try {
      await loginWithAnyEmail(email, password);
      location.hash = "#/dashboard";
    } catch (err) {
      const msg = /invalid-credential|wrong-password|user-not-found/.test(err.code || "")
        ? "Incorrect email or password."
        : err.message;
      toast(msg, "error");
      btn.disabled = false; btn.textContent = "Sign in";
    }
  });
}
