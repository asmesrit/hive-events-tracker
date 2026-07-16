// Admin — master student search & list, with in-app CRUD (edit/delete).
import { allStudents, allParticipations, updateUser, deleteUser, DEPARTMENTS, YEARS } from "../lib/db.js";
import { spinner, escapeHtml, emptyState, toast, openModal, closeModal, confirmDialog, debounce } from "../lib/ui.js";

export async function renderAdminStudents(el) {
  el.innerHTML = spinner("Loading students…");
  let students, parts;
  try { [students, parts] = await Promise.all([allStudents(), allParticipations()]); }
  catch (err) { el.innerHTML = `<p class="muted">Could not load: ${escapeHtml(err.message)}</p>`; return; }

  const counts = new Map();
  parts.forEach((p) => (p.memberUids || []).forEach((uid) => counts.set(uid, (counts.get(uid) || 0) + 1)));

  el.innerHTML = `
  <div class="page-head">
    <div><h1>Students</h1><div class="sub">${students.length} registered students</div></div>
  </div>
  <div class="filter-bar">
    <input type="search" id="f-text" placeholder="Search by name, register number or email…" />
    <select id="f-dept"><option value="">All departments</option>${DEPARTMENTS.map((d) => `<option>${d}</option>`).join("")}</select>
    <select id="f-year"><option value="">All years</option>${YEARS.map((y) => `<option>${y}</option>`).join("")}</select>
  </div>
  <div id="list"></div>`;

  const listEl = el.querySelector("#list");

  function draw() {
    const text = el.querySelector("#f-text").value.toLowerCase();
    const dept = el.querySelector("#f-dept").value;
    const year = el.querySelector("#f-year").value;
    const filtered = students.filter((s) =>
      (!text || (s.name || "").toLowerCase().includes(text) || (s.registerNumber || "").toLowerCase().includes(text) || (s.authEmail || "").includes(text)) &&
      (!dept || s.department === dept) &&
      (!year || s.year === year));

    if (!filtered.length) { listEl.innerHTML = emptyState("🎓", "No students match"); return; }

    listEl.innerHTML = `
    <div class="card table-wrap" style="padding:0">
      <table class="data">
        <thead><tr><th>Name</th><th>Reg. No</th><th>Dept</th><th>Year</th><th>Email</th><th>Events</th><th></th></tr></thead>
        <tbody>${filtered.map((s) => `
          <tr>
            <td class="clickable" data-open="${s.id}"><strong>${escapeHtml(s.name)}</strong></td>
            <td>${escapeHtml(s.registerNumber || "—")}</td>
            <td>${escapeHtml(s.department || "—")}</td>
            <td>${escapeHtml(s.year || "—")}</td>
            <td class="small">${escapeHtml(s.authEmail)}</td>
            <td><strong>${counts.get(s.id) || 0}</strong></td>
            <td style="white-space:nowrap">
              <button class="btn btn-ghost btn-sm" data-view="${s.id}">View</button>
              <button class="btn btn-ghost btn-sm" data-edit="${s.id}">Edit</button>
              <button class="btn btn-ghost btn-sm" data-del="${s.id}" style="color:var(--red)">Delete</button>
            </td>
          </tr>`).join("")}</tbody>
      </table>
    </div>`;

    listEl.querySelectorAll("[data-open],[data-view]").forEach((n) => {
      n.onclick = () => { location.hash = `#/admin/students/${n.dataset.open || n.dataset.view}`; };
    });
    listEl.querySelectorAll("[data-edit]").forEach((b) => {
      b.onclick = () => openEditModal(students.find((s) => s.id === b.dataset.edit));
    });
    listEl.querySelectorAll("[data-del]").forEach((b) => {
      b.onclick = async () => {
        const s = students.find((x) => x.id === b.dataset.del);
        const ok = await confirmDialog(
          `Delete ${s.name}'s profile? Their login remains in Firebase Auth (remove it from the Firebase console if needed); this deletes their HIVE profile data.`,
          { danger: true, okText: "Delete profile" });
        if (!ok) return;
        await deleteUser(s.id);
        toast("Student profile deleted", "success");
        renderAdminStudents(el);
      };
    });
  }

  function openEditModal(s) {
    const modal = openModal(`
      <h3>Edit student</h3>
      <form id="edit-form" class="form-grid" style="margin-top:8px">
        <div class="field full"><label>Name</label><input type="text" name="name" value="${escapeHtml(s.name || "")}" required /></div>
        <div class="field"><label>Year</label><select name="year">${YEARS.map((y) => `<option ${s.year === y ? "selected" : ""}>${y}</option>`).join("")}</select></div>
        <div class="field"><label>Department</label><select name="department">${DEPARTMENTS.map((d) => `<option ${s.department === d ? "selected" : ""}>${d}</option>`).join("")}</select></div>
        <div class="field full"><label>Register number</label><input type="text" name="registerNumber" value="${escapeHtml(s.registerNumber || "")}" /></div>
        <div class="field full"><label>Skills (comma separated)</label><input type="text" name="skills" value="${escapeHtml((s.skills || []).join(", "))}" /></div>
        <div class="field full modal-actions">
          <button class="btn btn-ghost" type="button" id="edit-cancel">Cancel</button>
          <button class="btn btn-primary" type="submit">Save</button>
        </div>
      </form>`, { wide: true });
    modal.querySelector("#edit-cancel").onclick = closeModal;
    modal.querySelector("#edit-form").onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      try {
        await updateUser(s.id, {
          name: data.name, year: data.year, department: data.department,
          registerNumber: data.registerNumber,
          skills: data.skills.split(",").map((x) => x.trim()).filter(Boolean),
        });
        closeModal();
        toast("Student updated", "success");
        renderAdminStudents(el);
      } catch (err) { toast(err.message, "error"); }
    };
  }

  draw();
  el.querySelector("#f-text").addEventListener("input", debounce(draw, 200));
  el.querySelector("#f-dept").addEventListener("input", draw);
  el.querySelector("#f-year").addEventListener("input", draw);
}
