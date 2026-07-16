// Admin — full profile of one student + every event they've participated in.
import { getUser, participationsByUser } from "../lib/db.js";
import { spinner, escapeHtml, statusBadge, typeBadge, fmtDate, emptyState, initials } from "../lib/ui.js";

export async function renderAdminStudentDetail(el, params) {
  const uid = params[0];
  el.innerHTML = spinner("Loading student…");

  const [student, parts] = await Promise.all([getUser(uid), participationsByUser(uid)]);
  if (!student) { el.innerHTML = "<p>Student not found.</p>"; return; }

  const won = parts.filter((p) => p.overallStatus === "won").length;
  const active = parts.filter((p) => p.overallStatus === "active").length;
  const lost = parts.filter((p) => p.overallStatus === "lost").length;

  el.innerHTML = `
  <div class="page-head">
    <div style="display:flex; align-items:center; gap:14px">
      <div class="avatar" style="width:52px;height:52px;font-size:18px">${escapeHtml(initials(student.name))}</div>
      <div>
        <h1>${escapeHtml(student.name)}</h1>
        <div class="sub">${escapeHtml([student.registerNumber, student.department, student.year && "Year " + student.year].filter(Boolean).join(" · "))}</div>
      </div>
    </div>
    <a class="btn btn-ghost" href="#/admin/students">← All students</a>
  </div>

  <div class="grid grid-4">
    <div class="card stat-card stat-accent"><span class="stat-label">Total</span><span class="stat-value">${parts.length}</span></div>
    <div class="card stat-card stat-blue"><span class="stat-label">Active</span><span class="stat-value">${active}</span></div>
    <div class="card stat-card stat-green"><span class="stat-label">Won</span><span class="stat-value">${won}</span></div>
    <div class="card stat-card stat-red"><span class="stat-label">Lost</span><span class="stat-value">${lost}</span></div>
  </div>

  <div class="grid grid-2" style="margin-top:16px">
    <div class="card">
      <h3>Profile</h3>
      <dl class="detail-list">
        <dt>College email</dt><dd>${escapeHtml(student.authEmail)}</dd>
        <dt>Personal alias</dt><dd>${student.aliasEmail ? escapeHtml(student.aliasEmail) : '<span class="muted">—</span>'}</dd>
        <dt>Skills</dt><dd>${(student.skills || []).length ? `<span class="chip-row">${student.skills.map((s) => `<span class="chip">${escapeHtml(s)}</span>`).join("")}</span>` : '<span class="muted">—</span>'}</dd>
        ${Object.entries(student.extraFields || {}).map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join("")}
        <dt>Joined</dt><dd>${fmtDate(student.createdAt)}</dd>
      </dl>
    </div>
    <div class="card">
      <h3>Participation history (${parts.length})</h3>
      ${parts.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>Event</th><th>Type</th><th>Status</th><th>Added</th></tr></thead>
        <tbody>${parts.map((p) => `
          <tr class="clickable" data-id="${p.id}">
            <td><strong>${escapeHtml(p.eventName)}</strong></td>
            <td>${typeBadge(p.eventType)}</td>
            <td>${statusBadge(p.overallStatus)}</td>
            <td class="small">${fmtDate(p.createdAt)}</td>
          </tr>`).join("")}</tbody>
      </table></div>` : emptyState("🐝", "No participations yet")}
    </div>
  </div>`;

  el.querySelectorAll("tr.clickable").forEach((tr) => {
    tr.onclick = () => { location.hash = `#/events/${tr.dataset.id}`; };
  });
}
