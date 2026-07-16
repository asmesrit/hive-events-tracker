// Profile — edit details, add personal alias email, change password.
import { session, setAliasEmail, changePassword } from "../lib/auth.js";
import { updateUser, DEPARTMENTS, YEARS } from "../lib/db.js";
import { toast, escapeHtml } from "../lib/ui.js";

export async function renderProfile(el) {
  const p = session.profile;
  if (!p) { el.innerHTML = "<p>Profile not found.</p>"; return; }
  const skills = [...(p.skills || [])];

  el.innerHTML = `
  <div class="page-head">
    <div><h1>My Profile</h1><div class="sub">Keep your details up to date</div></div>
  </div>

  <div class="grid grid-2">
    <div class="card">
      <h3>Profile details</h3>
      <form id="prof-form" class="form-grid">
        <div class="field full"><label>Full name</label><input type="text" name="name" value="${escapeHtml(p.name || "")}" required /></div>
        <div class="field"><label>Year</label>
          <select name="year">${YEARS.map((y) => `<option ${p.year === y ? "selected" : ""}>${y}</option>`).join("")}</select></div>
        <div class="field"><label>Department</label>
          <select name="department">${DEPARTMENTS.map((d) => `<option ${p.department === d ? "selected" : ""}>${d}</option>`).join("")}</select></div>
        <div class="field full"><label>Register number</label><input type="text" name="registerNumber" value="${escapeHtml(p.registerNumber || "")}" /></div>
        <div class="field full">
          <label>Top skills</label>
          <input type="text" id="skill-input" placeholder="Type a skill and press Enter" />
          <div class="chip-row" id="skill-chips" style="margin-top:8px"></div>
        </div>
        <div class="field full">
          <label>Extra fields <span class="muted small">(label: value per line)</span></label>
          <textarea name="extra">${escapeHtml(Object.entries(p.extraFields || {}).map(([k, v]) => `${k}: ${v}`).join("\n"))}</textarea>
        </div>
        <div class="field full"><button class="btn btn-primary" type="submit">Save profile</button></div>
      </form>
    </div>

    <div>
      <div class="card">
        <h3>Login emails</h3>
        <dl class="detail-list">
          <dt>College email</dt><dd>${escapeHtml(p.authEmail)}</dd>
          <dt>Personal alias</dt><dd>${p.aliasEmail ? escapeHtml(p.aliasEmail) : '<span class="muted">Not linked</span>'}</dd>
        </dl>
        <form id="alias-form" style="margin-top:14px; display:flex; gap:8px">
          <input type="email" name="alias" placeholder="personal@gmail.com" value="${escapeHtml(p.aliasEmail || "")}" required />
          <button class="btn btn-ghost" type="submit">${p.aliasEmail ? "Update" : "Link"}</button>
        </form>
        <p class="hint muted small" style="margin-top:8px">You can sign in with either email using the same password.</p>
      </div>

      <div class="card">
        <h3>Change password</h3>
        <form id="pw-form" style="display:flex; flex-direction:column; gap:10px">
          <div class="field"><label>Current password</label><input type="password" name="current" required /></div>
          <div class="field"><label>New password</label><input type="password" name="next" minlength="6" required /></div>
          <button class="btn btn-ghost" type="submit">Update password</button>
        </form>
      </div>
    </div>
  </div>`;

  // skills chips
  function drawChips() {
    const wrap = el.querySelector("#skill-chips");
    wrap.innerHTML = skills.map((s, i) => `<span class="chip">${escapeHtml(s)} <span class="x" data-i="${i}">×</span></span>`).join("");
    wrap.querySelectorAll(".x").forEach((x) => { x.onclick = () => { skills.splice(Number(x.dataset.i), 1); drawChips(); }; });
  }
  drawChips();
  el.querySelector("#skill-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = e.target.value.trim();
      if (v && !skills.includes(v)) { skills.push(v); drawChips(); }
      e.target.value = "";
    }
  });

  el.querySelector("#prof-form").onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const extraFields = {};
    (data.extra || "").split("\n").forEach((line) => {
      const idx = line.indexOf(":");
      if (idx > 0) extraFields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
    try {
      const patch = {
        name: data.name, year: data.year, department: data.department,
        registerNumber: data.registerNumber, skills, extraFields,
      };
      await updateUser(session.user.uid, patch);
      Object.assign(session.profile, patch);
      toast("Profile saved", "success");
    } catch (err) { toast(err.message, "error"); }
  };

  el.querySelector("#alias-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await setAliasEmail(new FormData(e.target).get("alias"));
      toast("Personal email linked — you can now sign in with it.", "success");
      renderProfile(el);
    } catch (err) { toast(err.message, "error"); }
  };

  el.querySelector("#pw-form").onsubmit = async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await changePassword(data.current, data.next);
      toast("Password updated", "success");
      e.target.reset();
    } catch (err) {
      toast(/wrong-password|invalid-credential/.test(err.code || "") ? "Current password is incorrect." : err.message, "error");
    }
  };
}
