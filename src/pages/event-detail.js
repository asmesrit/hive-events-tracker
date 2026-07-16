// Event detail — full view of one participation, quick status update, edit/delete.
import { session, isFaculty } from "../lib/auth.js";
import { getParticipation, updateParticipation, deleteParticipation, getOpportunity } from "../lib/db.js";
import { spinner, escapeHtml, statusBadge, typeBadge, fmtDate, fmtDateTime, toast, confirmDialog } from "../lib/ui.js";

export async function renderEventDetail(el, params) {
  const id = params[0];
  el.innerHTML = spinner("Loading event…");

  let ev;
  try { ev = await getParticipation(id); }
  catch { el.innerHTML = "<p>Event not found (it may have been deleted).</p>"; return; }

  const canEdit = ev.memberUids?.includes(session.user.uid) || isFaculty();
  const opp = ev.opportunityId ? await getOpportunity(ev.opportunityId) : null;
  const today = new Date().toISOString().slice(0, 10);

  el.innerHTML = `
  <div class="page-head">
    <div>
      <h1>${escapeHtml(ev.eventName)}</h1>
      <div class="sub">${typeBadge(ev.eventType)} ${statusBadge(ev.overallStatus)}</div>
    </div>
    <div style="display:flex; gap:8px">
      <a class="btn btn-ghost" href="#/events">← Back</a>
      ${canEdit ? `<a class="btn btn-ghost" href="#/events/${ev.id}/edit">✏️ Edit</a>
      <button class="btn btn-danger" id="del-btn">Delete</button>` : ""}
    </div>
  </div>

  <div class="grid grid-2">
    <div>
      <div class="card">
        <h3>Details</h3>
        <dl class="detail-list">
          <dt>Team size</dt><dd>${ev.teamSize || 1}</dd>
          <dt>Overall status</dt><dd>${statusBadge(ev.overallStatus)}</dd>
          <dt>Current progress</dt><dd>${escapeHtml(ev.currentStatus || "—")}</dd>
          <dt>Added by</dt><dd>${escapeHtml(ev.createdByName || "—")}</dd>
          <dt>Added on</dt><dd>${fmtDateTime(ev.createdAt)}</dd>
          <dt>Last updated</dt><dd>${fmtDateTime(ev.updatedAt)}</dd>
          ${opp ? `<dt>Linked event</dt><dd>📢 ${escapeHtml(opp.name)}${opp.registrationLink ? ` · <a href="${escapeHtml(opp.registrationLink)}" target="_blank" rel="noopener">registration link ↗</a>` : ""}</dd>` : ""}
        </dl>
      </div>

      ${canEdit ? `
      <div class="card">
        <h3>Quick status update</h3>
        <form id="quick-form" style="display:flex; flex-direction:column; gap:10px">
          <div class="field">
            <label>Overall status</label>
            <select name="overallStatus">
              ${["active", "won", "lost"].map((s) => `<option ${ev.overallStatus === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Current progress</label>
            <textarea name="currentStatus">${escapeHtml(ev.currentStatus || "")}</textarea>
          </div>
          <button class="btn btn-primary" type="submit">Update</button>
        </form>
      </div>` : ""}
    </div>

    <div>
      <div class="card">
        <h3>Team</h3>
        <div class="member-row">
            <div class="avatar">${escapeHtml((ev.createdByName || "?")[0].toUpperCase())}</div>
            <div class="who"><div class="nm">${escapeHtml(ev.createdByName || "Creator")} <span class="badge badge-type">owner</span></div></div>
          </div>
          ${(ev.members || []).map((m) => `
            <div class="member-row">
              <div class="avatar">${escapeHtml((m.name || "?")[0].toUpperCase())}</div>
              <div class="who">
                <div class="nm">${escapeHtml(m.name)} ${
                  m.type === "registered" ? '<span class="badge badge-won">HIVE user</span>'
                  : m.type === "srit-pending" ? '<span class="badge badge-active">pending signup</span>'
                  : '<span class="badge badge-neutral">other college</span>'}</div>
                <div class="em">${escapeHtml(m.email || "")}</div>
              </div>
            </div>`).join("")}
      </div>

      <div class="card">
        <h3>Dates to track</h3>
        ${(ev.datesToTrack || []).length
          ? (ev.datesToTrack).slice().sort((a, b) => a.date.localeCompare(b.date)).map((d) => `
            <div class="member-row">
              <div class="who">
                <span class="nm">${escapeHtml(d.label)}</span>
                <div class="em">${fmtDate(d.date)} ${d.date < today ? '<span class="badge badge-neutral">past</span>' : d.date === today ? '<span class="badge badge-won">today</span>' : '<span class="badge badge-active">upcoming</span>'}</div>
              </div>
            </div>`).join("")
          : '<p class="muted small">No dates added.</p>'}
      </div>
    </div>
  </div>`;

  if (canEdit) {
    el.querySelector("#quick-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      try {
        await updateParticipation(ev.id, { overallStatus: data.overallStatus, currentStatus: data.currentStatus });
        toast("Status updated", "success");
        renderEventDetail(el, params);
      } catch (err) { toast(err.message, "error"); }
    });

    el.querySelector("#del-btn")?.addEventListener("click", async () => {
      const ok = await confirmDialog(`Delete "${ev.eventName}"? This removes it for the whole team.`, { danger: true, okText: "Delete" });
      if (!ok) return;
      try {
        await deleteParticipation(ev.id);
        toast("Event deleted", "success");
        location.hash = "#/events";
      } catch (err) { toast(err.message, "error"); }
    });
  }
}
