// Deadline reminder popup — when a posted opportunity hits its "valid till"
// date (deadline today or tomorrow), remind the user once per day at login.
import { listOpportunities } from "./db.js";
import { openModal, closeModal, escapeHtml } from "./ui.js";

const SEEN_KEY = "hive.deadlineReminderShown";

export async function maybeShowDeadlineReminder() {
  const today = new Date().toISOString().slice(0, 10);
  // only once per browser per day
  if (localStorage.getItem(SEEN_KEY) === today) return;

  let opps;
  try { opps = await listOpportunities(); } catch { return; }

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const due = opps.filter((o) => o.expiresOn === today || o.expiresOn === tomorrow);
  if (!due.length) return;

  localStorage.setItem(SEEN_KEY, today);

  const modal = openModal(`
    <h3>⏰ Deadline reminder</h3>
    <p class="muted small" style="margin-bottom:12px">These posted events hit their deadline — register before it's too late!</p>
    ${due.map((o) => `
      <div class="member-row">
        <div class="notif-icon">${o.isBroadcast ? "📢" : "💡"}</div>
        <div class="who">
          <div class="nm">${escapeHtml(o.name)}
            <span class="badge ${o.expiresOn === today ? "badge-lost" : "badge-active"}">${o.expiresOn === today ? "due TODAY" : "due tomorrow"}</span>
          </div>
          <div class="em">${escapeHtml(o.type || "Event")}${o.registrationLink ? ` · <a href="${escapeHtml(o.registrationLink)}" target="_blank" rel="noopener">registration link ↗</a>` : ""}</div>
        </div>
        <button class="btn btn-primary btn-sm" data-track="${o.id}">🎯 Track</button>
      </div>`).join("")}
    <div class="modal-actions">
      <button class="btn btn-ghost" id="rem-later">Dismiss</button>
      <a class="btn btn-primary" href="#/opportunities" id="rem-all">See all opportunities</a>
    </div>`);

  modal.querySelector("#rem-later").onclick = closeModal;
  modal.querySelector("#rem-all").onclick = closeModal;
  modal.querySelectorAll("[data-track]").forEach((b) => {
    b.onclick = () => {
      sessionStorage.setItem("hive.trackOpportunity", b.dataset.track);
      closeModal();
      location.hash = "#/events/new";
    };
  });
}
