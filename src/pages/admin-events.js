// Admin — every participation across the college, filterable by event,
// status, type, department, and period. Faculty can open/edit/delete any.
import { allParticipations, allUsers, deleteParticipation, EVENT_TYPES, DEPARTMENTS } from "../lib/db.js";
import { spinner, escapeHtml, emptyState, statusBadge, typeBadge, fmtDate, toJsDate, toast, confirmDialog, debounce } from "../lib/ui.js";

export async function renderAdminEvents(el) {
  el.innerHTML = spinner("Loading all participations…");
  let parts, users;
  try { [parts, users] = await Promise.all([allParticipations(), allUsers()]); }
  catch (err) { el.innerHTML = `<p class="muted">Could not load: ${escapeHtml(err.message)}</p>`; return; }

  const userMap = new Map(users.map((u) => [u.id, u]));

  // distinct event names for the event filter dropdown
  const eventNames = [...new Set(parts.map((p) => p.eventName))].sort();

  el.innerHTML = `
  <div class="page-head">
    <div><h1>All Events</h1><div class="sub">${parts.length} participation entries across the college</div></div>
    <a class="btn btn-primary" href="#/admin/reports">📄 Export report</a>
  </div>
  <div class="filter-bar">
    <input type="search" id="f-text" placeholder="Search event or student…" />
    <select id="f-event"><option value="">All events</option>${eventNames.map((n) => `<option>${escapeHtml(n)}</option>`).join("")}</select>
    <select id="f-status"><option value="">All statuses</option><option value="active">Active</option><option value="won">Won</option><option value="lost">Lost</option></select>
    <select id="f-type"><option value="">All types</option>${EVENT_TYPES.map((t) => `<option>${t}</option>`).join("")}</select>
    <select id="f-dept"><option value="">All departments</option>${DEPARTMENTS.map((d) => `<option>${d}</option>`).join("")}</select>
    <input type="date" id="f-from" title="From date" />
    <input type="date" id="f-to" title="To date" />
  </div>
  <div id="list"></div>`;

  const listEl = el.querySelector("#list");

  function teamNames(p) {
    const names = [p.createdByName, ...(p.members || []).map((m) => m.name)].filter(Boolean);
    return names.join(", ");
  }

  function deptOf(p) {
    // department of the creator (fallback: any registered member)
    const u = userMap.get(p.createdBy) || (p.memberUids || []).map((id) => userMap.get(id)).find(Boolean);
    return u?.department || "";
  }

  function draw() {
    const text = el.querySelector("#f-text").value.toLowerCase();
    const evName = el.querySelector("#f-event").value;
    const st = el.querySelector("#f-status").value;
    const ty = el.querySelector("#f-type").value;
    const dept = el.querySelector("#f-dept").value;
    const from = el.querySelector("#f-from").value;
    const to = el.querySelector("#f-to").value;

    const filtered = parts.filter((p) => {
      const d = toJsDate(p.createdAt);
      const iso = d ? d.toISOString().slice(0, 10) : "";
      return (!text || p.eventName.toLowerCase().includes(text) || teamNames(p).toLowerCase().includes(text)) &&
        (!evName || p.eventName === evName) &&
        (!st || p.overallStatus === st) &&
        (!ty || p.eventType === ty) &&
        (!dept || deptOf(p) === dept) &&
        (!from || iso >= from) && (!to || iso <= to);
    });

    if (!filtered.length) { listEl.innerHTML = emptyState("🗂️", "No entries match these filters"); return; }

    listEl.innerHTML = `
    <div class="card table-wrap" style="padding:0">
      <table class="data">
        <thead><tr><th>Event</th><th>Type</th><th>Team</th><th>Dept</th><th>Status</th><th>Added</th><th></th></tr></thead>
        <tbody>${filtered.map((p) => `
          <tr>
            <td class="clickable" data-open="${p.id}"><strong>${escapeHtml(p.eventName)}</strong>${p.opportunityId ? ' <span title="Linked to a posted event">🔗</span>' : ""}</td>
            <td>${typeBadge(p.eventType)}</td>
            <td class="small" style="max-width:220px">${escapeHtml(teamNames(p))}</td>
            <td>${escapeHtml(deptOf(p) || "—")}</td>
            <td>${statusBadge(p.overallStatus)}</td>
            <td class="small">${fmtDate(p.createdAt)}</td>
            <td style="white-space:nowrap">
              <button class="btn btn-ghost btn-sm" data-open="${p.id}">View</button>
              <button class="btn btn-ghost btn-sm" data-del="${p.id}" style="color:var(--red)">Delete</button>
            </td>
          </tr>`).join("")}</tbody>
      </table>
    </div>
    <p class="muted small" style="margin-top:8px">${filtered.length} of ${parts.length} entries shown</p>`;

    listEl.querySelectorAll("[data-open]").forEach((n) => {
      n.onclick = () => { location.hash = `#/events/${n.dataset.open}`; };
    });
    listEl.querySelectorAll("[data-del]").forEach((b) => {
      b.onclick = async (e) => {
        e.stopPropagation();
        const p = parts.find((x) => x.id === b.dataset.del);
        const ok = await confirmDialog(`Delete "${p.eventName}" entry by ${p.createdByName}?`, { danger: true, okText: "Delete" });
        if (!ok) return;
        await deleteParticipation(p.id);
        toast("Entry deleted", "success");
        renderAdminEvents(el);
      };
    });
  }

  draw();
  el.querySelector("#f-text").addEventListener("input", debounce(draw, 200));
  ["f-event", "f-status", "f-type", "f-dept", "f-from", "f-to"].forEach((id) => {
    el.querySelector("#" + id).addEventListener("input", draw);
  });
}
