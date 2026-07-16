// My Events — list of everything the user participates in, with filters.
import { myParticipations, EVENT_TYPES } from "../lib/db.js";
import { spinner, emptyState, escapeHtml, statusBadge, typeBadge, fmtDate } from "../lib/ui.js";

export async function renderEvents(el) {
  el.innerHTML = spinner("Loading your events…");
  let events;
  try { events = await myParticipations(); }
  catch (err) { el.innerHTML = `<p class="muted">Could not load events: ${escapeHtml(err.message)}</p>`; return; }

  el.innerHTML = `
  <div class="page-head">
    <div><h1>My Events</h1><div class="sub">${events.length} participation${events.length === 1 ? "" : "s"} tracked</div></div>
    <a class="btn btn-primary" href="#/events/new">＋ Add event</a>
  </div>
  <div class="filter-bar">
    <input type="search" id="f-text" placeholder="Search event name…" />
    <select id="f-status">
      <option value="">All statuses</option>
      <option value="active">Active</option><option value="won">Won</option><option value="lost">Lost</option>
    </select>
    <select id="f-type">
      <option value="">All types</option>
      ${EVENT_TYPES.map((t) => `<option>${t}</option>`).join("")}
    </select>
  </div>
  <div id="events-list"></div>`;

  const listEl = el.querySelector("#events-list");

  function nextDate(ev) {
    const today = new Date().toISOString().slice(0, 10);
    const future = (ev.datesToTrack || []).filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    return future[0] || null;
  }

  function draw() {
    const text = el.querySelector("#f-text").value.toLowerCase();
    const st = el.querySelector("#f-status").value;
    const ty = el.querySelector("#f-type").value;
    const filtered = events.filter((ev) =>
      (!text || ev.eventName.toLowerCase().includes(text)) &&
      (!st || ev.overallStatus === st) &&
      (!ty || ev.eventType === ty));

    if (!filtered.length) {
      listEl.innerHTML = events.length
        ? emptyState("🔍", "No events match your filters")
        : emptyState("🐝", "Nothing tracked yet", "Add your first hackathon or event to start tracking.");
      return;
    }

    listEl.innerHTML = `
    <div class="card table-wrap" style="padding:0">
      <table class="data">
        <thead><tr>
          <th>Event</th><th>Type</th><th>Team</th><th>Status</th><th>Next date</th><th>Progress</th>
        </tr></thead>
        <tbody>
          ${filtered.map((ev) => {
            const nd = nextDate(ev);
            return `<tr class="clickable" data-id="${ev.id}">
              <td><strong>${escapeHtml(ev.eventName)}</strong><div class="muted small">added ${fmtDate(ev.createdAt)}</div></td>
              <td>${typeBadge(ev.eventType)}</td>
              <td>${ev.teamSize || 1} member${(ev.teamSize || 1) > 1 ? "s" : ""}</td>
              <td>${statusBadge(ev.overallStatus)}</td>
              <td>${nd ? `${escapeHtml(nd.label)}<div class="muted small">${fmtDate(nd.date)}</div>` : '<span class="muted">—</span>'}</td>
              <td class="muted small" style="max-width:220px">${escapeHtml((ev.currentStatus || "").slice(0, 80))}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
    listEl.querySelectorAll("tr.clickable").forEach((tr) => {
      tr.onclick = () => { location.hash = `#/events/${tr.dataset.id}`; };
    });
  }

  draw();
  ["f-text", "f-status", "f-type"].forEach((id) => {
    el.querySelector("#" + id).addEventListener("input", draw);
  });
}
