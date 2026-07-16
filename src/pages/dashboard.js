// Student dashboard — personal analytics of tracked participations.
import { session } from "../lib/auth.js";
import { myParticipations } from "../lib/db.js";
import { spinner, escapeHtml, emptyState, fmtDate, statusBadge, toJsDate } from "../lib/ui.js";

const PALETTE = ["#f5a300", "#2563eb", "#1a7f4b", "#c0392b", "#7c3aed", "#0e9494", "#d97706", "#64748b"];

export async function renderDashboard(el) {
  el.innerHTML = spinner("Crunching your numbers…");
  let events;
  try { events = await myParticipations(); }
  catch (err) { el.innerHTML = `<p class="muted">Could not load dashboard: ${escapeHtml(err.message)}</p>`; return; }

  const name = session.profile?.name?.split(" ")[0] || "there";
  const won = events.filter((e) => e.overallStatus === "won").length;
  const lost = events.filter((e) => e.overallStatus === "lost").length;
  const active = events.filter((e) => e.overallStatus === "active").length;

  // upcoming tracked dates across all events
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.flatMap((ev) =>
    (ev.datesToTrack || []).filter((d) => d.date >= today)
      .map((d) => ({ ...d, eventName: ev.eventName, id: ev.id, overallStatus: ev.overallStatus })))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);

  el.innerHTML = `
  <div class="page-head">
    <div><h1>Hey ${escapeHtml(name)} 👋</h1><div class="sub">Here's your participation snapshot</div></div>
    <a class="btn btn-primary" href="#/events/new">＋ Add event</a>
  </div>

  <div class="grid grid-4">
    <div class="card stat-card stat-accent"><span class="stat-label">Total events</span><span class="stat-value">${events.length}</span></div>
    <div class="card stat-card stat-blue"><span class="stat-label">Active</span><span class="stat-value">${active}</span></div>
    <div class="card stat-card stat-green"><span class="stat-label">Won</span><span class="stat-value">${won}</span><span class="stat-hint">${events.length ? Math.round((won / events.length) * 100) + "% win rate" : ""}</span></div>
    <div class="card stat-card stat-red"><span class="stat-label">Lost</span><span class="stat-value">${lost}</span></div>
  </div>

  ${events.length ? `
  <div class="grid grid-2" style="margin-top:16px">
    <div class="card"><h3>By event type</h3><div class="chart-box"><canvas id="chart-type"></canvas></div></div>
    <div class="card"><h3>Outcomes</h3><div class="chart-box"><canvas id="chart-status"></canvas></div></div>
  </div>
  <div class="card" style="margin-top:16px"><h3>Participation over time</h3><div class="chart-box"><canvas id="chart-time"></canvas></div></div>
  ` : `<div style="margin-top:16px">${emptyState("🐝", "Your hive is empty", "Add your first event and your analytics will appear here.")}</div>`}

  <div class="card" style="margin-top:16px">
    <h3>⏰ Upcoming dates</h3>
    ${upcoming.length ? upcoming.map((u) => `
      <div class="member-row">
        <div class="who">
          <span class="nm"><a href="#/events/${u.id}">${escapeHtml(u.eventName)}</a></span>
          <div class="em">${escapeHtml(u.label)} — ${fmtDate(u.date)}</div>
        </div>
        ${statusBadge(u.overallStatus)}
      </div>`).join("") : '<p class="muted small">No upcoming tracked dates. Add dates to your events to see reminders here.</p>'}
  </div>`;

  if (!events.length) return;

  /* ---- charts ---- */
  const byType = {};
  events.forEach((e) => { byType[e.eventType || "Other"] = (byType[e.eventType || "Other"] || 0) + 1; });

  new Chart(el.querySelector("#chart-type"), {
    type: "doughnut",
    data: {
      labels: Object.keys(byType),
      datasets: [{ data: Object.values(byType), backgroundColor: PALETTE, borderWidth: 2, borderColor: "#fff" }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right" } }, cutout: "62%" },
  });

  new Chart(el.querySelector("#chart-status"), {
    type: "bar",
    data: {
      labels: ["Active", "Won", "Lost"],
      datasets: [{ data: [active, won, lost], backgroundColor: ["#2563eb", "#1a7f4b", "#c0392b"], borderRadius: 8, maxBarThickness: 70 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });

  // monthly counts for the last 8 months
  const months = [];
  const now = new Date();
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), count: 0 });
  }
  events.forEach((e) => {
    const d = toJsDate(e.createdAt);
    if (!d) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const m = months.find((x) => x.key === key);
    if (m) m.count++;
  });

  new Chart(el.querySelector("#chart-time"), {
    type: "line",
    data: {
      labels: months.map((m) => m.label),
      datasets: [{
        label: "Events added", data: months.map((m) => m.count),
        borderColor: "#f5a300", backgroundColor: "rgba(245,163,0,.15)", fill: true, tension: .35, pointRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}
