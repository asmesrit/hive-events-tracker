// Registration — 2-step wizard: account (role, email, password) → profile.
// Students: sritcbe.ac.in email only, optional "use default password".
// Faculty: additionally require an invite code.
import { registerAccount } from "../lib/auth.js";
import { toast, escapeHtml } from "../lib/ui.js";
import { ALLOWED_DOMAIN, DEFAULT_PASSWORD } from "../lib/firebase-config.js";
import { DEPARTMENTS, YEARS } from "../lib/db.js";

export async function renderRegister(el) {
  const state = { step: 1, account: {}, skills: [] };

  function draw() {
    el.innerHTML = `
    <div class="auth-wrap">
      <div class="auth-card ${state.step === 2 ? "wide" : ""}">
        <div class="auth-brand">
          <div class="bee">🐝</div>
          <h1>Join HIVE</h1>
          <p>${state.step === 1 ? "Create your account" : "Set up your profile"}</p>
        </div>
        <div class="step-dots"><span class="${state.step >= 1 ? "on" : ""}"></span><span class="${state.step >= 2 ? "on" : ""}"></span></div>
        ${state.step === 1 ? stepAccount() : stepProfile()}
        <div class="auth-alt">Already have an account? <a href="#/login">Sign in</a></div>
      </div>
    </div>`;
    wire();
  }

  function stepAccount() {
    const a = state.account;
    return `
    <form id="acc-form">
      <div class="field">
        <label>I am a</label>
        <div class="radio-group">
          <label><input type="radio" name="role" value="student" ${a.role !== "faculty" ? "checked" : ""}/> Student</label>
          <label><input type="radio" name="role" value="faculty" ${a.role === "faculty" ? "checked" : ""}/> Faculty / Admin</label>
        </div>
      </div>
      <div class="field" id="invite-field" style="display:${a.role === "faculty" ? "flex" : "none"}">
        <label>Faculty invite code</label>
        <input type="text" name="inviteCode" value="${escapeHtml(a.inviteCode || "")}" placeholder="Provided by the admin team" />
      </div>
      <div class="field">
        <label>College email</label>
        <input type="email" name="email" value="${escapeHtml(a.email || "")}" placeholder="you@${escapeHtml(ALLOWED_DOMAIN)}" required />
        <span class="hint">Only @${escapeHtml(ALLOWED_DOMAIN)} addresses can register. You can link a personal email later.</span>
      </div>
      <div class="field">
        <label>Password</label>
        <input type="password" name="password" value="${escapeHtml(a.password || "")}" minlength="6" required />
        <span class="hint">Minimum 6 characters. You can change it anytime from your profile.</span>
      </div>
      <label class="checkbox-row"><input type="checkbox" id="use-default" /> Use the default password (<code>${escapeHtml(DEFAULT_PASSWORD)}</code>)</label>
      <button class="btn btn-primary btn-block" type="submit">Continue →</button>
    </form>`;
  }

  function stepProfile() {
    return `
    <form id="prof-form">
      <div class="form-grid">
        <div class="field full">
          <label>Full name</label>
          <input type="text" name="name" required placeholder="Your name" />
        </div>
        <div class="field">
          <label>Year</label>
          <select name="year">${YEARS.map((y) => `<option>${y}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label>Department</label>
          <select name="department">${DEPARTMENTS.map((d) => `<option>${d}</option>`).join("")}</select>
        </div>
        <div class="field full">
          <label>Register number</label>
          <input type="text" name="registerNumber" required placeholder="e.g. 71812201001" />
        </div>
        <div class="field full">
          <label>Top skills</label>
          <div class="autocomplete-wrap">
            <input type="text" id="skill-input" placeholder="Type a skill and press Enter (e.g. Python, UI Design)" />
          </div>
          <div class="chip-row" id="skill-chips" style="margin-top:8px"></div>
        </div>
        <div class="field full">
          <label>Anything extra? <span class="muted small">(optional — label: value, e.g. "GitHub: myhandle")</span></label>
          <textarea name="extra" placeholder="LinkedIn: …&#10;Portfolio: …"></textarea>
        </div>
      </div>
      <div class="modal-actions" style="justify-content:space-between">
        <button class="btn btn-ghost" type="button" id="back-btn">← Back</button>
        <button class="btn btn-primary" type="submit" id="create-btn">Create account 🎉</button>
      </div>
    </form>`;
  }

  function drawSkillChips() {
    const wrap = el.querySelector("#skill-chips");
    if (!wrap) return;
    wrap.innerHTML = state.skills.map((s, i) =>
      `<span class="chip">${escapeHtml(s)} <span class="x" data-i="${i}">×</span></span>`).join("");
    wrap.querySelectorAll(".x").forEach((x) => {
      x.onclick = () => { state.skills.splice(Number(x.dataset.i), 1); drawSkillChips(); };
    });
  }

  function wire() {
    if (state.step === 1) {
      const form = el.querySelector("#acc-form");
      form.querySelectorAll('input[name="role"]').forEach((r) => {
        r.onchange = () => {
          el.querySelector("#invite-field").style.display = r.value === "faculty" && r.checked ? "flex" : "none";
        };
      });
      el.querySelector("#use-default").onchange = (e) => {
        const pw = form.querySelector('input[name="password"]');
        if (e.target.checked) { pw.value = DEFAULT_PASSWORD; pw.readOnly = true; }
        else { pw.readOnly = false; }
      };
      form.onsubmit = (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        if (!data.email.toLowerCase().endsWith("@" + ALLOWED_DOMAIN)) {
          toast(`Please use your @${ALLOWED_DOMAIN} email.`, "error");
          return;
        }
        if (data.role === "faculty" && !data.inviteCode?.trim()) {
          toast("Faculty registration needs an invite code.", "error");
          return;
        }
        state.account = data;
        state.step = 2;
        draw();
      };
    } else {
      drawSkillChips();
      const skillInput = el.querySelector("#skill-input");
      skillInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const v = skillInput.value.trim();
          if (v && !state.skills.includes(v)) { state.skills.push(v); drawSkillChips(); }
          skillInput.value = "";
        }
      });
      el.querySelector("#back-btn").onclick = () => { state.step = 1; draw(); };
      el.querySelector("#prof-form").onsubmit = async (e) => {
        e.preventDefault();
        const btn = el.querySelector("#create-btn");
        btn.disabled = true; btn.textContent = "Creating…";
        const data = Object.fromEntries(new FormData(e.target));
        const extraFields = {};
        (data.extra || "").split("\n").forEach((line) => {
          const idx = line.indexOf(":");
          if (idx > 0) extraFields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
        });
        try {
          await registerAccount({
            email: state.account.email,
            password: state.account.password,
            role: state.account.role || "student",
            inviteCode: state.account.inviteCode,
            profile: {
              name: data.name,
              year: data.year,
              department: data.department,
              registerNumber: data.registerNumber,
              skills: state.skills,
              extraFields,
            },
          });
          toast("Welcome to HIVE! 🐝", "success");
          location.hash = "#/dashboard";
        } catch (err) {
          const msg = err.code === "auth/email-already-in-use"
            ? "This email is already registered." : err.message;
          toast(msg, "error");
          btn.disabled = false; btn.textContent = "Create account 🎉";
        }
      };
    }
  }

  draw();
}
