// Student-wise report generation (PDF + CSV) — used by the admin student
// detail page and by students downloading their own profile report.
// Events are grouped by outcome (won → active → lost); each event is one
// block carrying its own details plus certificate & photo links.
import { fmtDate } from "./ui.js";
import { getMentors } from "./db.js";
import { APP_NAME } from "./firebase-config.js";

const STATUS_ORDER = ["won", "active", "lost"];
const STATUS_LABEL = { won: "🏆 WON", active: "🔵 ACTIVE", lost: "🔴 LOST" };
const STATUS_COLOR = { won: [26, 127, 75], active: [37, 99, 235], lost: [192, 57, 43] };

function teamNames(p) {
  return [p.createdByName, ...(p.members || []).map((m) => m.name)].filter(Boolean).join(", ");
}

/** parts sorted won → active → lost (anything else last), newest first inside a group */
function sortByOutcome(parts) {
  const rank = (p) => {
    const i = STATUS_ORDER.indexOf(p.overallStatus);
    return i === -1 ? STATUS_ORDER.length : i;
  };
  return [...parts].sort((a, b) => rank(a) - rank(b));
}

/** Detailed one-student PDF: profile header, stats, then event blocks
 *  grouped by outcome, each with its details + certificate/photo links. */
export function downloadStudentPdf(student, parts) {
  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF(); // portrait A4

  const won = parts.filter((p) => p.overallStatus === "won").length;
  const active = parts.filter((p) => p.overallStatus === "active").length;
  const lost = parts.filter((p) => p.overallStatus === "lost").length;
  const certCount = parts.reduce((n, p) => n + (p.certificates || []).length, 0);

  // ---- header ----
  docPdf.setFillColor(35, 34, 31);
  docPdf.rect(0, 0, 210, 34, "F");
  docPdf.setTextColor(245, 163, 0);
  docPdf.setFontSize(18);
  docPdf.text(APP_NAME, 14, 14);
  docPdf.setFontSize(11);
  docPdf.setTextColor(255);
  docPdf.text("Student Participation Report", 14, 22);
  docPdf.setFontSize(9);
  docPdf.setTextColor(200);
  docPdf.text(`Generated ${new Date().toLocaleString("en-IN")}`, 14, 29);

  // ---- profile ----
  docPdf.setTextColor(30);
  docPdf.setFontSize(15);
  docPdf.text(student.name || "Student", 14, 46);
  docPdf.setFontSize(10);
  docPdf.setTextColor(90);
  const profileLines = [
    `Register No: ${student.registerNumber || "-"}    Department: ${student.department || "-"}    Year: ${student.year || "-"}`,
    `College email: ${student.authEmail || "-"}${student.aliasEmail ? `    Personal: ${student.aliasEmail}` : ""}`,
    `Skills: ${(student.skills || []).join(", ") || "-"}`,
    ...Object.entries(student.extraFields || {}).map(([k, v]) => `${k}: ${v}`),
  ];
  let y = 53;
  profileLines.forEach((line) => { docPdf.text(String(line).slice(0, 110), 14, y); y += 5.5; });

  // ---- stats strip ----
  y += 3;
  const stats = [
    ["Total events", parts.length], ["Won", won], ["Active", active], ["Lost", lost], ["Certificates", certCount],
  ];
  let x = 14;
  stats.forEach(([label, val]) => {
    docPdf.setFillColor(255, 244, 221);
    docPdf.roundedRect(x, y, 34, 14, 2, 2, "F");
    docPdf.setTextColor(30);
    docPdf.setFontSize(12);
    docPdf.text(String(val), x + 17, y + 6.5, { align: "center" });
    docPdf.setFontSize(7);
    docPdf.setTextColor(120);
    docPdf.text(String(label), x + 17, y + 11.5, { align: "center" });
    x += 38;
  });
  y += 22;

  // ---- events grouped by outcome, one block per event ----
  const groups = STATUS_ORDER.map((st) => ({
    status: st,
    items: parts.filter((p) => p.overallStatus === st),
  })).filter((g) => g.items.length);
  // anything with an unexpected status goes last
  const misc = parts.filter((p) => !STATUS_ORDER.includes(p.overallStatus));
  if (misc.length) groups.push({ status: "other", items: misc });

  for (const g of groups) {
    // group heading bar
    if (y > 265) { docPdf.addPage(); y = 16; }
    const color = STATUS_COLOR[g.status] || [100, 116, 139];
    docPdf.setFillColor(...color);
    docPdf.rect(14, y, 182, 8, "F");
    docPdf.setTextColor(255);
    docPdf.setFontSize(10);
    docPdf.text(`${(STATUS_LABEL[g.status] || g.status.toUpperCase())}  (${g.items.length})`, 17, y + 5.6);
    y += 11;

    for (const p of g.items) {
      const rows = [
        ["Type", p.eventType || "-"],
        ["Team", `${teamNames(p)}  (size ${p.teamSize || 1})`],
      ];
      const mentors = getMentors(p).map((m) => m.name).join(", ");
      if (mentors) rows.push(["Faculty mentor(s)", mentors]);
      if (p.prizeMoney?.amount) rows.push(["Prize money", `${p.prizeMoney.amount} ${p.prizeMoney.currency || "INR"}`]);
      if (p.currentStatus) rows.push(["Progress", p.currentStatus]);
      rows.push(["Added on", fmtDate(p.createdAt)]);
      (p.certificates || []).forEach((c, i) => {
        rows.push([`Certificate ${i + 1}`, `${c.label} (${c.kind}) — ${c.url}`]);
      });
      (p.photos || []).forEach((ph, i) => {
        rows.push([`Photo ${i + 1}`, `${ph.label} — ${ph.url}`]);
      });

      docPdf.autoTable({
        startY: y,
        head: [[{ content: p.eventName, colSpan: 2 }]],
        body: rows,
        theme: "grid",
        styles: { fontSize: 8, cellPadding: 1.8, overflow: "linebreak" },
        headStyles: { fillColor: [245, 163, 0], textColor: [28, 21, 0], fontSize: 9.5 },
        columnStyles: { 0: { cellWidth: 36, fontStyle: "bold", textColor: [110, 110, 105] } },
        margin: { left: 14, right: 14 },
      });
      y = docPdf.lastAutoTable.finalY + 5;
      if (y > 265) { docPdf.addPage(); y = 16; }
    }
    y += 3;
  }

  const safe = (student.name || "student").replace(/[^\w-]+/g, "-");
  docPdf.save(`HIVE-${safe}-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/** CSV of one student's participations — same won → active → lost order,
 *  certificate and photo links inline per event row. */
export function downloadStudentCsv(student, parts) {
  const COLS = ["Outcome", "Event", "Type", "Team members", "Team size", "Mentors", "Prize money", "Certificate links", "Photo links", "Progress", "Added on"];
  const sorted = sortByOutcome(parts);
  const rowToArr = (p) => [
    p.overallStatus || "", p.eventName, p.eventType || "", teamNames(p), p.teamSize || 1,
    getMentors(p).map((m) => m.name).join(", "),
    p.prizeMoney?.amount ? `${p.prizeMoney.amount} ${p.prizeMoney.currency || "INR"}` : "",
    (p.certificates || []).map((c) => `${c.label} (${c.kind}): ${c.url}`).join("  |  "),
    (p.photos || []).map((ph) => `${ph.label}: ${ph.url}`).join("  |  "),
    p.currentStatus || "", fmtDate(p.createdAt),
  ];
  const esc = (v) => `"${String(v).replaceAll('"', '""')}"`;
  const csv = [COLS.map(esc).join(","), ...sorted.map((p) => rowToArr(p).map(esc).join(","))].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const safe = (student.name || "student").replace(/[^\w-]+/g, "-");
  a.download = `HIVE-${safe}-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
