// Admin analytics — global visual overview of all students & participations.
import { allParticipations, allStudents } from "../lib/db.js";
import { spinner, escapeHtml, toJsDate } from "../lib/ui.js";

const PALETTE = ["#f5a300", "#2563eb", "#1a7f4b", "#c0392b", "#7c3aed", "#0e9494", "#d97706", "#64748b", "#be185d", "#334155"];

export async function renderAdminDashboard(el) {
  el.innerHTML = spinner("Loading college-wide analytics…");
  let parts, students;
  try { [parts, students] = await Promise.all([allParticipations(), allStudents()]); }
  catch (err) { el.innerHTML = `<p class="muted">Could not load: ${escapeHtml(err.message)}</p>`; return; }

  const won = parts.filter((p) => p.overallStatus === "won").length;
  const active = parts.filter((p) => p.overallStatus === "active").length;
  const lost = parts.filter((p) => p.overallStatus === "lost").length;

  // participation counts per student (by memberUids)
  const perStudent = new Map();
  parts.forEach((p) => (p.memberUids || []).forEach((uid) => perStudent.set(uid, (perStudent.get(uid) || 0) + 1)));
  const topStudents = students
    .map((s) => ({ ...s, count: perStudent.get(s.id) || 0 }))
    .sort((a, b) => b.count - a.count).slice(0, 8);

  const byDept = {};
  students.forEach((s) => {
    const d = s.department || "Other";
    if (!byDept[d]) byDept[d] = { students: 0, participations: 0 };
    byDept[d].students++;
    byDept[d].participations += perStudent.get(s.id) || 0;
  });

  const byType = {};
  parts.forEach((p) => { byType[p.eventType || "Other"] = (byType[p.eventType || "Other"] || 0) + 1; });

  el.innerHTML = `
  <div class="page-head">
    <div><h1>College Analytics</h1><div class="sub">Every student, every event — at a glance</div></div>
    <a class="btn btn-primary" href="#/admin/reports">📄 Generate reports</a>
  </div>

  <div class="grid grid-4">
    <div class="card stat-card stat-accent"><span class="stat-label">Students</span><span class="stat-value">${students.length}</span></div>
    <div class="card stat-card stat-blue"><span class="stat-label">Participations</span><span class="stat-value">${parts.length}</span><span class="stat-hint">${active} active</span></div>
    <div class="card stat-card stat-green"><span class="stat-label">Wins</span><span class="stat-value">${won}</span><span class="stat-hint">${parts.length ? Math.round((won / parts.length) * 100) + "% of all entries" : ""}</span></div>
    <div class="card stat-card stat-red"><span class="stat-label">Losses</span><span class="stat-value">${lost}</span></div>
  </div>

  <div class="grid grid-2" style="margin-top:16px">
    <div class="card"><h3>Participations by event type</h3><div class="chart-box"><canvas id="c-type"></canvas></div></div>
    <div class="card"><h3>Outcome split</h3><div class="chart-box"><canvas id="c-status"></canvas></div></div>
    <div class="card"><h3>Participations by department</h3><div class="chart-box"><canvas id="c-dept"></canvas></div></div>
    <div class="card"><h3>Monthly participation trend</h3><div class="chart-box"><canvas id="c-time"></canvas></div></div>
  </div>

  <div class="card" style="margin-top:16px">
    <h3>🏅 Most active students</h3>
    <div class="table-wrap"><table class="data">
      <thead><tr><th>#</th><th>Name</th><th>Dept / Year</th><th>Reg. No</th><th>Events</th></tr></thead>
      <tbody>${topStudents.map((s, i) => `
        <tr class="clickable" data-id="${s.id}">
          <td>${i + 1}</td>
          <td><strong>${escapeHtml(s.name)}</strong></td>
          <td>${escapeHtml([s.department, s.year && "Year " + s.year].filter(Boolean).join(" · "))}</td>
          <td>${escapeHtml(s.registerNumber || "—")}</td>
          <td><strong>${s.count}</strong></td>
        </tr>`).join("")}</tbody>
    </table></div>
  </div>`;

  el.querySelectorAll("tr.clickable").forEach((tr) => {
    tr.onclick = () => { location.hash = `#/admin/students/${tr.dataset.id}`; };
  });

  /* charts */
  new Chart(el.querySelector("#c-type"), {
    type: "doughnut",
    data: { labels: Object.keys(byType), datasets: [{ data: Object.values(byType), backgroundColor: PALETTE, borderWidth: 2, borderColor: "#fff" }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right" } }, cutout: "62%" },
  });

  new Chart(el.querySelector("#c-status"), {
    type: "pie",
    data: { labels: ["Active", "Won", "Lost"], datasets: [{ data: [active, won, lost], backgroundColor: ["#2563eb", "#1a7f4b", "#c0392b"], borderWidth: 2, borderColor: "#fff" }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right" } } },
  });

  new Chart(el.querySelector("#c-dept"), {
    type: "bar",
    data: {
      labels: Object.keys(byDept),
      datasets: [
        { label: "Students", data: Object.values(byDept).map((d) => d.students), backgroundColor: "#64748b", borderRadius: 6 },
        { label: "Participations", data: Object.values(byDept).map((d) => d.participations), backgroundColor: "#f5a300", borderRadius: 6 },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });

  const months = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }), count: 0 });
  }
  parts.forEach((p) => {
    const d = toJsDate(p.createdAt);
    if (!d) return;
    const m = months.find((x) => x.key === `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    if (m) m.count++;
  });
  new Chart(el.querySelector("#c-time"), {
    type: "line",
    data: { labels: months.map((m) => m.label), datasets: [{ label: "Entries", data: months.map((m) => m.count), borderColor: "#f5a300", backgroundColor: "rgba(245,163,0,.15)", fill: true, tension: .35 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });
}
