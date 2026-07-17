// Admin — report builder: filter participations by period/status/type/dept,
// then export CSV or PDF. Also manages faculty invite codes.
import { allParticipations, allUsers, EVENT_TYPES, DEPARTMENTS, createInviteCode, listInviteCodes } from "../lib/db.js";
import { spinner, escapeHtml, toJsDate, fmtDate, toast, statusBadge, typeBadge } from "../lib/ui.js";
import { APP_NAME } from "../lib/firebase-config.js";

const REPORT_PRESETS = [
  { id: "all", label: "All participations", filter: () => true },
  { id: "won", label: "Events won", filter: (p) => p.overallStatus === "won" },
  { id: "active", label: "Currently active events", filter: (p) => p.overallStatus === "active" },
  { id: "lost", label: "Events lost", filter: (p) => p.overallStatus === "lost" },
];

export async function renderAdminReports(el) {
  el.innerHTML = spinner("Preparing report builder…");
  let parts, users, codes;
  try {
    [parts, users, codes] = await Promise.all([allParticipations(), allUsers(), listInviteCodes()]);
  } catch (err) { el.innerHTML = `<p class="muted">Could not load: ${escapeHtml(err.message)}</p>`; return; }

  const userMap = new Map(users.map((u) => [u.id, u]));

  el.innerHTML = `
  <div class="page-head">
    <div><h1>Reports</h1><div class="sub">Filter, preview and export participation reports</div></div>
  </div>

  <div class="card">
    <h3>Report builder</h3>
    <div class="filter-bar" style="margin-bottom:0">
      <select id="r-preset">${REPORT_PRESETS.map((r) => `<option value="${r.id}">${r.label}</option>`).join("")}</select>
      <select id="r-type"><option value="">All types</option>${EVENT_TYPES.map((t) => `<option>${t}</option>`).join("")}</select>
      <select id="r-dept"><option value="">All departments</option>${DEPARTMENTS.map((d) => `<option>${d}</option>`).join("")}</select>
      <input type="date" id="r-from" title="From" />
      <input type="date" id="r-to" title="To" />
      <button class="btn btn-primary btn-sm" id="r-csv">⬇ CSV</button>
      <button class="btn btn-primary btn-sm" id="r-pdf">⬇ PDF</button>
    </div>
  </div>

  <div id="preview" style="margin-top:16px"></div>

  <div class="card" style="margin-top:16px">
    <h3>Faculty invite codes</h3>
    <p class="muted small">Share a code with a colleague so they can register with faculty access. Each code works once.</p>
    <form id="code-form" style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap">
      <input type="text" name="code" placeholder="e.g. HIVE-FACULTY-2026-B" required style="flex:1; min-width:220px" />
      <button class="btn btn-ghost" type="submit">Create code</button>
    </form>
    <div class="table-wrap" style="margin-top:12px"><table class="data">
      <thead><tr><th>Code</th><th>Status</th></tr></thead>
      <tbody>${codes.length ? codes.map((c) => `
        <tr><td><code>${escapeHtml(c.id)}</code></td>
        <td>${c.used ? '<span class="badge badge-neutral">used</span>' : '<span class="badge badge-won">available</span>'}</td></tr>`).join("")
        : '<tr><td colspan="2" class="muted">No codes yet</td></tr>'}</tbody>
    </table></div>
  </div>`;

  const previewEl = el.querySelector("#preview");

  function currentRows() {
    const preset = REPORT_PRESETS.find((r) => r.id === el.querySelector("#r-preset").value);
    const ty = el.querySelector("#r-type").value;
    const dept = el.querySelector("#r-dept").value;
    const from = el.querySelector("#r-from").value;
    const to = el.querySelector("#r-to").value;

    return parts.filter((p) => {
      const d = toJsDate(p.createdAt);
      const iso = d ? d.toISOString().slice(0, 10) : "";
      const creator = userMap.get(p.createdBy);
      return preset.filter(p) &&
        (!ty || p.eventType === ty) &&
        (!dept || creator?.department === dept) &&
        (!from || iso >= from) && (!to || iso <= to);
    }).map((p) => {
      const creator = userMap.get(p.createdBy);
      return {
        event: p.eventName,
        type: p.eventType || "",
        student: p.createdByName || "",
        regNo: creator?.registerNumber || "",
        dept: creator?.department || "",
        year: creator?.year || "",
        team: [p.createdByName, ...(p.members || []).map((m) => m.name)].filter(Boolean).join(", "),
        teamSize: p.teamSize || 1,
        status: p.overallStatus || "",
        mentor: p.mentor?.name || "",
        certs: (p.certificates || []).length,
        certLinks: (p.certificates || []).map((c) => `${c.label} (${c.kind}): ${c.url}`).join("  |  "),
        progress: p.currentStatus || "",
        added: fmtDate(p.createdAt),
        _p: p,
      };
    });
  }

  function reportTitle() {
    const preset = REPORT_PRESETS.find((r) => r.id === el.querySelector("#r-preset").value);
    const from = el.querySelector("#r-from").value;
    const to = el.querySelector("#r-to").value;
    let t = preset.label;
    if (from || to) t += ` (${from || "…"} to ${to || "…"})`;
    return t;
  }

  function draw() {
    const rows = currentRows();
    previewEl.innerHTML = `
    <div class="card table-wrap" style="padding:0">
      <table class="data">
        <thead><tr><th>Event</th><th>Type</th><th>Student</th><th>Reg. No</th><th>Dept</th><th>Mentor</th><th>Status</th><th>📜</th><th>Added</th></tr></thead>
        <tbody>${rows.length ? rows.map((r) => `
          <tr>
            <td><strong>${escapeHtml(r.event)}</strong></td>
            <td>${typeBadge(r.type)}</td>
            <td>${escapeHtml(r.student)}</td>
            <td>${escapeHtml(r.regNo)}</td>
            <td>${escapeHtml(r.dept)}</td>
            <td>${escapeHtml(r.mentor || "—")}</td>
            <td>${statusBadge(r.status)}</td>
            <td>${r.certs || ""}</td>
            <td class="small">${escapeHtml(r.added)}</td>
          </tr>`).join("") : '<tr><td colspan="9" class="muted" style="text-align:center;padding:30px">No entries match this report</td></tr>'}</tbody>
      </table>
    </div>
    <p class="muted small" style="margin-top:8px">${rows.length} entr${rows.length === 1 ? "y" : "ies"} in this report</p>`;
  }

  const COLS = ["Event", "Type", "Student", "Reg. No", "Department", "Year", "Team members", "Team size", "Faculty mentor", "Status", "Certificates", "Certificate links", "Progress", "Added on"];
  const rowToArr = (r) => [r.event, r.type, r.student, r.regNo, r.dept, r.year, r.team, r.teamSize, r.mentor, r.status, r.certs, r.certLinks, r.progress, r.added];

  el.querySelector("#r-csv").onclick = () => {
    const rows = currentRows();
    if (!rows.length) { toast("Nothing to export.", "error"); return; }
    const esc = (v) => `"${String(v).replaceAll('"', '""')}"`;
    const csv = [COLS.map(esc).join(","), ...rows.map((r) => rowToArr(r).map(esc).join(","))].join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `HIVE-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("CSV downloaded", "success");
  };

  el.querySelector("#r-pdf").onclick = () => {
    const rows = currentRows();
    if (!rows.length) { toast("Nothing to export.", "error"); return; }
    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF({ orientation: "landscape" });
    docPdf.setFontSize(16);
    docPdf.text(`${APP_NAME} — ${reportTitle()}`, 14, 16);
    docPdf.setFontSize(10);
    docPdf.setTextColor(120);
    docPdf.text(`Generated ${new Date().toLocaleString("en-IN")} · ${rows.length} entries`, 14, 23);
    docPdf.autoTable({
      startY: 28,
      head: [COLS],
      body: rows.map(rowToArr),
      styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
      headStyles: { fillColor: [245, 163, 0], textColor: [28, 21, 0] },
      alternateRowStyles: { fillColor: [250, 249, 245] },
      columnStyles: { 11: { cellWidth: 55 } }, // certificate links wrap
    });
    docPdf.save(`HIVE-report-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast("PDF downloaded", "success");
  };

  el.querySelector("#code-form").onsubmit = async (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get("code").trim();
    if (!code) return;
    try {
      await createInviteCode(code);
      toast("Invite code created", "success");
      renderAdminReports(el);
    } catch (err) { toast(err.message, "error"); }
  };

  draw();
  ["r-preset", "r-type", "r-dept", "r-from", "r-to"].forEach((id) => {
    el.querySelector("#" + id).addEventListener("input", draw);
  });
}
