// Faculty — teams this faculty member mentors, with stats and CSV/PDF export.
import { session } from "../lib/auth.js";
import { participationsByMentor } from "../lib/db.js";
import { spinner, escapeHtml, emptyState, statusBadge, typeBadge, fmtDate, toast, toJsDate } from "../lib/ui.js";
import { APP_NAME } from "../lib/firebase-config.js";

export async function renderAdminMentoring(el) {
  el.innerHTML = spinner("Loading the teams you mentor…");
  let parts;
  try { parts = await participationsByMentor(session.user.uid); }
  catch (err) { el.innerHTML = `<p class="muted">Could not load: ${escapeHtml(err.message)}</p>`; return; }

  const won = parts.filter((p) => p.overallStatus === "won").length;
  const active = parts.filter((p) => p.overallStatus === "active").length;
  const lost = parts.filter((p) => p.overallStatus === "lost").length;

  el.innerHTML = `
  <div class="page-head">
    <div><h1>🧑‍🏫 My Mentoring</h1><div class="sub">${parts.length} team${parts.length === 1 ? "" : "s"} list you as their faculty mentor</div></div>
    <div style="display:flex; gap:8px">
      <button class="btn btn-primary btn-sm" id="m-csv" ${parts.length ? "" : "disabled"}>⬇ CSV</button>
      <button class="btn btn-primary btn-sm" id="m-pdf" ${parts.length ? "" : "disabled"}>⬇ PDF</button>
    </div>
  </div>

  <div class="grid grid-4">
    <div class="card stat-card stat-accent"><span class="stat-label">Teams</span><span class="stat-value">${parts.length}</span></div>
    <div class="card stat-card stat-blue"><span class="stat-label">Active</span><span class="stat-value">${active}</span></div>
    <div class="card stat-card stat-green"><span class="stat-label">Won</span><span class="stat-value">${won}</span></div>
    <div class="card stat-card stat-red"><span class="stat-label">Lost</span><span class="stat-value">${lost}</span></div>
  </div>

  <div class="filter-bar" style="margin-top:16px">
    <input type="search" id="f-text" placeholder="Search event or student…" />
    <select id="f-status"><option value="">All statuses</option><option value="active">Active</option><option value="won">Won</option><option value="lost">Lost</option></select>
  </div>
  <div id="list"></div>`;

  const listEl = el.querySelector("#list");

  const teamNames = (p) => [p.createdByName, ...(p.members || []).map((m) => m.name)].filter(Boolean).join(", ");

  function currentRows() {
    const text = el.querySelector("#f-text").value.toLowerCase();
    const st = el.querySelector("#f-status").value;
    return parts.filter((p) =>
      (!text || p.eventName.toLowerCase().includes(text) || teamNames(p).toLowerCase().includes(text)) &&
      (!st || p.overallStatus === st));
  }

  function draw() {
    const rows = currentRows();
    if (!rows.length) {
      listEl.innerHTML = parts.length
        ? emptyState("🔍", "Nothing matches these filters")
        : emptyState("🧑‍🏫", "No mentored teams yet", "When students add you as their faculty mentor on an event, it appears here.");
      return;
    }
    listEl.innerHTML = `
    <div class="card table-wrap" style="padding:0">
      <table class="data">
        <thead><tr><th>Event</th><th>Type</th><th>Team</th><th>Status</th><th>📜</th><th>Added</th></tr></thead>
        <tbody>${rows.map((p) => `
          <tr class="clickable" data-id="${p.id}">
            <td><strong>${escapeHtml(p.eventName)}</strong></td>
            <td>${typeBadge(p.eventType)}</td>
            <td class="small" style="max-width:240px">${escapeHtml(teamNames(p))}</td>
            <td>${statusBadge(p.overallStatus)}</td>
            <td>${(p.certificates || []).length || ""}</td>
            <td class="small">${fmtDate(p.createdAt)}</td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;
    listEl.querySelectorAll("tr.clickable").forEach((tr) => {
      tr.onclick = () => { location.hash = `#/events/${tr.dataset.id}`; };
    });
  }

  /* ---- export ---- */
  const COLS = ["Event", "Type", "Team members", "Team size", "Status", "Prize money", "Certificates", "Certificate links", "Progress", "Added on"];
  const rowToArr = (p) => [
    p.eventName, p.eventType || "", teamNames(p), p.teamSize || 1, p.overallStatus || "",
    p.prizeMoney?.amount ? `${p.prizeMoney.amount} ${p.prizeMoney.currency || "INR"}` : "",
    (p.certificates || []).length,
    (p.certificates || []).map((c) => `${c.label} (${c.kind}): ${c.url}`).join("  |  "),
    p.currentStatus || "", fmtDate(p.createdAt),
  ];

  el.querySelector("#m-csv")?.addEventListener("click", () => {
    const rows = currentRows();
    if (!rows.length) { toast("Nothing to export.", "error"); return; }
    const esc = (v) => `"${String(v).replaceAll('"', '""')}"`;
    const csv = [COLS.map(esc).join(","), ...rows.map((p) => rowToArr(p).map(esc).join(","))].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `HIVE-mentoring-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("CSV downloaded", "success");
  });

  el.querySelector("#m-pdf")?.addEventListener("click", () => {
    const rows = currentRows();
    if (!rows.length) { toast("Nothing to export.", "error"); return; }
    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF({ orientation: "landscape" });
    docPdf.setFontSize(16);
    docPdf.text(`${APP_NAME} — Teams mentored by ${session.profile?.name || ""}`, 14, 16);
    docPdf.setFontSize(10);
    docPdf.setTextColor(120);
    docPdf.text(`Generated ${new Date().toLocaleString("en-IN")} · ${rows.length} teams`, 14, 23);
    docPdf.autoTable({
      startY: 28,
      head: [COLS],
      body: rows.map(rowToArr),
      styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: [245, 163, 0], textColor: [28, 21, 0] },
      alternateRowStyles: { fillColor: [250, 249, 245] },
      columnStyles: { 7: { cellWidth: 55 } },
    });
    docPdf.save(`HIVE-mentoring-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast("PDF downloaded", "success");
  });

  draw();
  el.querySelector("#f-text").addEventListener("input", draw);
  el.querySelector("#f-status").addEventListener("input", draw);
}
