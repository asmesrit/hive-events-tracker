// Student-wise report generation (PDF + CSV) — used by the admin student
// detail page and by students downloading their own profile report.
import { fmtDate } from "./ui.js";
import { getMentors } from "./db.js";
import { APP_NAME } from "./firebase-config.js";

const COLS = ["Event", "Type", "Team members", "Team size", "Mentors", "Status", "Prize money", "Certificates", "Certificate links", "Progress", "Added on"];

function teamNames(p) {
  return [p.createdByName, ...(p.members || []).map((m) => m.name)].filter(Boolean).join(", ");
}

function rowToArr(p) {
  return [
    p.eventName, p.eventType || "", teamNames(p), p.teamSize || 1,
    getMentors(p).map((m) => m.name).join(", "),
    p.overallStatus || "",
    p.prizeMoney?.amount ? `${p.prizeMoney.amount} ${p.prizeMoney.currency || "INR"}` : "",
    (p.certificates || []).length,
    (p.certificates || []).map((c) => `${c.label} (${c.kind}): ${c.url}`).join("  |  "),
    p.currentStatus || "", fmtDate(p.createdAt),
  ];
}

/** Detailed one-student PDF: profile header, stats, participations, certificates. */
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
  docPdf.text(`🐝 ${APP_NAME}`.replace("🐝 ", ""), 14, 14);
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
    ["Total events", parts.length], ["Active", active], ["Won", won], ["Lost", lost], ["Certificates", certCount],
  ];
  docPdf.setFontSize(10);
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
  y += 20;

  // ---- participations table ----
  docPdf.autoTable({
    startY: y,
    head: [["Event", "Type", "Status", "Team", "Mentors", "Prize", "Added"]],
    body: parts.map((p) => [
      p.eventName, p.eventType || "", p.overallStatus || "", `${p.teamSize || 1}`,
      getMentors(p).map((m) => m.name).join(", "),
      p.prizeMoney?.amount ? `${p.prizeMoney.amount} ${p.prizeMoney.currency || "INR"}` : "",
      fmtDate(p.createdAt),
    ]),
    styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
    headStyles: { fillColor: [245, 163, 0], textColor: [28, 21, 0] },
    alternateRowStyles: { fillColor: [250, 249, 245] },
  });

  // ---- certificates ----
  const certs = parts.flatMap((p) =>
    (p.certificates || []).map((c) => ({ ...c, eventName: p.eventName })));
  if (certs.length) {
    docPdf.autoTable({
      startY: docPdf.lastAutoTable.finalY + 8,
      head: [["Certificate", "Kind", "Event", "Link"]],
      body: certs.map((c) => [c.label, c.kind, c.eventName, c.url]),
      styles: { fontSize: 7.5, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [35, 34, 31], textColor: [255, 255, 255] },
      columnStyles: { 3: { cellWidth: 70 } },
    });
  }

  const safe = (student.name || "student").replace(/[^\w-]+/g, "-");
  docPdf.save(`HIVE-${safe}-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

/** CSV of one student's participations. */
export function downloadStudentCsv(student, parts) {
  const esc = (v) => `"${String(v).replaceAll('"', '""')}"`;
  const csv = [COLS.map(esc).join(","), ...parts.map((p) => rowToArr(p).map(esc).join(","))].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const safe = (student.name || "student").replace(/[^\w-]+/g, "-");
  a.download = `HIVE-${safe}-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
