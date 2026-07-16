// Shared UI helpers: toasts, modals, escaping, formatting

export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function toast(message, type = "info", ms = 3500) {
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/** Show a modal. contentHtml is trusted markup built by the caller.
 *  Returns the modal element; call closeModal() to dismiss. */
export function openModal(contentHtml, { wide = false } = {}) {
  const root = document.getElementById("modal-root");
  root.innerHTML = `
    <div class="modal-overlay" data-close="1">
      <div class="modal ${wide ? "modal-wide" : ""}" role="dialog" aria-modal="true">
        ${contentHtml}
      </div>
    </div>`;
  root.querySelector(".modal-overlay").addEventListener("click", (e) => {
    if (e.target.dataset.close) closeModal();
  });
  return root.querySelector(".modal");
}

export function closeModal() {
  document.getElementById("modal-root").innerHTML = "";
}

/** Confirmation dialog -> Promise<boolean> */
export function confirmDialog(message, { danger = false, okText = "Confirm" } = {}) {
  return new Promise((resolve) => {
    const modal = openModal(`
      <h3>Are you sure?</h3>
      <p class="muted">${escapeHtml(message)}</p>
      <div class="modal-actions">
        <button class="btn btn-ghost" data-act="cancel">Cancel</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok">${escapeHtml(okText)}</button>
      </div>`);
    modal.querySelector('[data-act="cancel"]').onclick = () => { closeModal(); resolve(false); };
    modal.querySelector('[data-act="ok"]').onclick = () => { closeModal(); resolve(true); };
  });
}

export function spinner(label = "Loading…") {
  return `<div class="spinner-wrap"><div class="spinner"></div><p class="muted">${escapeHtml(label)}</p></div>`;
}

export function emptyState(icon, title, sub = "") {
  return `<div class="empty-state">
    <div class="empty-icon">${icon}</div>
    <h3>${escapeHtml(title)}</h3>
    ${sub ? `<p class="muted">${escapeHtml(sub)}</p>` : ""}
  </div>`;
}

// ---- formatting ----

export function fmtDate(value) {
  const d = toJsDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function fmtDateTime(value) {
  const d = toJsDate(value);
  if (!d) return "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function toJsDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate(); // Firestore Timestamp
  const d = new Date(value);
  return isNaN(d) ? null : d;
}

export function statusBadge(overallStatus) {
  const map = { active: "badge-active", won: "badge-won", lost: "badge-lost" };
  const cls = map[overallStatus] || "badge-neutral";
  return `<span class="badge ${cls}">${escapeHtml(overallStatus || "—")}</span>`;
}

export function typeBadge(eventType) {
  return `<span class="badge badge-type">${escapeHtml(eventType || "—")}</span>`;
}

export function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
}

/** Debounce helper for search inputs */
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Serialize a form element into a plain object (inputs/selects/textareas by name) */
export function formData(formEl) {
  const out = {};
  new FormData(formEl).forEach((v, k) => { out[k] = typeof v === "string" ? v.trim() : v; });
  return out;
}
