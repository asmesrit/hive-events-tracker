// HIVE Events Tracker — bootstrap + hash router + app shell
import { initAuth, session, logout, isFaculty } from "./lib/auth.js";
import { escapeHtml, initials, toast } from "./lib/ui.js";
import { APP_NAME } from "./lib/firebase-config.js";

import { renderLogin } from "./pages/login.js";
import { renderRegister } from "./pages/register.js";
import { renderDashboard } from "./pages/dashboard.js";
import { renderEvents } from "./pages/events.js";
import { renderEventForm } from "./pages/event-form.js";
import { renderEventDetail } from "./pages/event-detail.js";
import { renderOpportunities } from "./pages/opportunities.js";
import { renderProfile } from "./pages/profile.js";
import { renderAdminDashboard } from "./pages/admin-dashboard.js";
import { renderAdminStudents } from "./pages/admin-students.js";
import { renderAdminStudentDetail } from "./pages/admin-student-detail.js";
import { renderAdminEvents } from "./pages/admin-events.js";
import { renderAdminReports } from "./pages/admin-reports.js";
import { renderAdminMentoring } from "./pages/admin-mentoring.js";

const appEl = document.getElementById("app");

/* route table: pattern -> { render, auth: 'public'|'student'|'faculty'|'any' } */
const routes = [
  { path: /^#\/login$/, render: renderLogin, auth: "public" },
  { path: /^#\/register$/, render: renderRegister, auth: "public" },
  { path: /^#\/dashboard$/, render: renderDashboard, auth: "any" },
  { path: /^#\/events$/, render: renderEvents, auth: "any" },
  { path: /^#\/events\/new$/, render: renderEventForm, auth: "any" },
  { path: /^#\/events\/([\w-]+)\/edit$/, render: (el, m) => renderEventForm(el, m), auth: "any" },
  { path: /^#\/events\/([\w-]+)$/, render: (el, m) => renderEventDetail(el, m), auth: "any" },
  { path: /^#\/opportunities$/, render: renderOpportunities, auth: "any" },
  { path: /^#\/profile$/, render: renderProfile, auth: "any" },
  { path: /^#\/admin\/dashboard$/, render: renderAdminDashboard, auth: "faculty" },
  { path: /^#\/admin\/students$/, render: renderAdminStudents, auth: "faculty" },
  { path: /^#\/admin\/students\/([\w-]+)$/, render: (el, m) => renderAdminStudentDetail(el, m), auth: "faculty" },
  { path: /^#\/admin\/events$/, render: renderAdminEvents, auth: "faculty" },
  { path: /^#\/admin\/reports$/, render: renderAdminReports, auth: "faculty" },
  { path: /^#\/admin\/mentoring$/, render: renderAdminMentoring, auth: "faculty" },
];

export function navigate(hash) { location.hash = hash; }

function currentRoute() {
  const hash = location.hash || "#/dashboard";
  for (const r of routes) {
    const m = hash.match(r.path);
    if (m) return { ...r, params: m.slice(1) };
  }
  return null;
}

async function renderRoute() {
  const route = currentRoute();
  const authed = !!session.user;

  if (!route) { navigate(authed ? "#/dashboard" : "#/login"); return; }

  if (route.auth === "public") {
    if (authed) { navigate("#/dashboard"); return; }
    appEl.innerHTML = "";
    await route.render(appEl, route.params);
    return;
  }

  if (!authed) { navigate("#/login"); return; }
  if (route.auth === "faculty" && !isFaculty()) {
    toast("Faculty access only", "error");
    navigate("#/dashboard");
    return;
  }

  renderShell(route);
  const outlet = document.getElementById("outlet");
  await route.render(outlet, route.params);
}

/* ---------- shell (sidebar + outlet) ---------- */

function navItem(hash, icon, label) {
  const active = (location.hash || "#/dashboard").startsWith(hash) ? "active" : "";
  return `<a class="nav-link ${active}" href="${hash}"><span>${icon}</span>${escapeHtml(label)}</a>`;
}

function renderShell() {
  const p = session.profile || {};
  const faculty = isFaculty();
  appEl.innerHTML = `
  <div class="app-shell">
    <aside class="sidebar">
      <div class="sidebar-brand"><span class="bee">🐝</span> HIVE</div>
      <div class="sidebar-sub">Events Tracker</div>
      <nav>
        ${navItem("#/dashboard", "📊", "Dashboard")}
        ${navItem("#/events", "🏆", "My Events")}
        ${navItem("#/opportunities", "🔔", "Opportunities")}
        ${navItem("#/profile", "👤", "Profile")}
        ${faculty ? `
          <div class="nav-section">Admin</div>
          ${navItem("#/admin/dashboard", "📈", "Analytics")}
          ${navItem("#/admin/students", "🎓", "Students")}
          ${navItem("#/admin/events", "🗂️", "All Events")}
          ${navItem("#/admin/mentoring", "🧑‍🏫", "My Mentoring")}
          ${navItem("#/admin/reports", "📄", "Reports")}
        ` : ""}
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="avatar">${escapeHtml(initials(p.name || "?"))}</div>
          <div>
            <div class="name">${escapeHtml(p.name || "User")}</div>
            <div class="role">${escapeHtml(p.role || "")}</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm btn-block" id="logout-btn" style="color:#cfccc3;border-color:rgba(255,255,255,.2)">Sign out</button>
      </div>
    </aside>
    <main class="main" id="outlet"></main>
  </div>`;
  document.getElementById("logout-btn").onclick = async () => {
    await logout();
    navigate("#/login");
  };
}

/* ---------- boot ---------- */

document.title = APP_NAME;
window.addEventListener("hashchange", renderRoute);

initAuth().then(() => {
  renderRoute();
  // re-render on auth changes (login/logout from another tab, etc.)
  import("./lib/auth.js").then(({ onSessionChange }) => {
    let lastUid = session.user?.uid || null;
    onSessionChange((s) => {
      const uid = s.user?.uid || null;
      if (uid !== lastUid) { lastUid = uid; renderRoute(); }
    });
  });
});
