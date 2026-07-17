// Create / edit a participation entry.
// - Event name autocomplete against opportunities + existing participations
// - Team members: registered (user search) | SRIT not-yet-registered (college
//   email) | external / other college (personal email)
// - Dates to track, current status, overall status (active/won/lost)
import { session, isSritEmail, normEmail } from "../lib/auth.js";
import {
  EVENT_TYPES, createParticipation, updateParticipation, getParticipation,
  searchUsersByName, searchFacultyByName, searchOpportunities, searchParticipationNames, getOpportunity, findUserByEmail,
} from "../lib/db.js";
import { toast, escapeHtml, debounce, spinner } from "../lib/ui.js";
import { ALLOWED_DOMAIN } from "../lib/firebase-config.js";

export async function renderEventForm(el, params = []) {
  const editId = params[0] || null;
  el.innerHTML = spinner(editId ? "Loading event…" : "Preparing form…");

  let existing = null;
  if (editId) {
    try { existing = await getParticipation(editId); }
    catch { el.innerHTML = "<p>Event not found.</p>"; return; }
  }

  // "Track this event" prefill (?opp=<id> stored in sessionStorage by opportunities page)
  let prefillOpp = null;
  const oppId = sessionStorage.getItem("hive.trackOpportunity");
  if (!editId && oppId) {
    sessionStorage.removeItem("hive.trackOpportunity");
    prefillOpp = await getOpportunity(oppId);
  }

  const state = {
    members: existing ? (existing.members || []).filter((m) => m.uid !== existing.createdBy) : [],
    datesToTrack: existing?.datesToTrack || [],
    opportunityId: existing?.opportunityId || prefillOpp?.id || null,
    mentors: existing ? (existing.mentors || (existing.mentor ? [existing.mentor] : [])) : [],
  };

  const ev = existing || {};
  const typeOptions = EVENT_TYPES.map((t) =>
    `<option ${(ev.eventType || prefillOpp?.type) === t ? "selected" : ""}>${t}</option>`).join("");

  el.innerHTML = `
  <div class="page-head">
    <div>
      <h1>${editId ? "Edit event" : "Add an event"}</h1>
      <div class="sub">${editId ? "Update your participation details" : "Log a hackathon, workshop or any event you're participating in"}</div>
    </div>
    <a class="btn btn-ghost" href="#/events">← Back to My Events</a>
  </div>

  <form id="event-form">
    <div class="card">
      <h3>Event details</h3>
      <div class="form-grid">
        <div class="field full">
          <label>Event name</label>
          <div class="autocomplete-wrap">
            <input type="text" name="eventName" id="event-name" autocomplete="off" required
              value="${escapeHtml(ev.eventName || prefillOpp?.name || "")}" placeholder="Start typing — existing events will appear" />
            <div class="autocomplete-list" id="name-suggest" style="display:none"></div>
          </div>
          <span class="hint" id="opp-link-hint">${state.opportunityId ? "🔗 Linked to a posted event — faculty can filter participants by it." : "Selecting a suggestion links your entry to that event."}</span>
        </div>
        <div class="field">
          <label>Event type</label>
          <select name="eventType">${typeOptions}</select>
        </div>
        <div class="field" id="other-type-field" style="display:none">
          <label>Specify type</label>
          <input type="text" name="eventTypeOther" placeholder="e.g. Debate" value="${escapeHtml(!EVENT_TYPES.includes(ev.eventType) && ev.eventType ? ev.eventType : "")}" />
        </div>
        <div class="field">
          <label>Team size (including you)</label>
          <input type="number" name="teamSize" min="1" max="20" value="${ev.teamSize || 1}" required />
        </div>
        <div class="field">
          <label>Overall status</label>
          <select name="overallStatus">
            ${["active", "won", "lost"].map((s) => `<option ${(ev.overallStatus || "active") === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
        <div class="field full">
          <label>Current status / progress notes</label>
          <textarea name="currentStatus" placeholder="e.g. Round 2 cleared, waiting for finals shortlist">${escapeHtml(ev.currentStatus || "")}</textarea>
        </div>
        <div class="field full">
          <label>Received prize money?</label>
          <div class="radio-group">
            <label><input type="radio" name="hasPrize" value="no" ${!ev.prizeMoney?.amount ? "checked" : ""}/> No</label>
            <label><input type="radio" name="hasPrize" value="yes" ${ev.prizeMoney?.amount ? "checked" : ""}/> Yes</label>
          </div>
        </div>
        <div class="field" id="prize-amount-field" style="display:none">
          <label>Prize money amount</label>
          <input type="number" name="prizeAmount" min="0" step="any" value="${ev.prizeMoney?.amount || ""}" placeholder="e.g. 25000" />
        </div>
        <div class="field" id="prize-currency-field" style="display:none">
          <label>Currency</label>
          <select name="prizeCurrency">
            ${["INR", "USD", "EUR", "Other"].map((c) => `<option ${(ev.prizeMoney?.currency && !["INR","USD","EUR"].includes(ev.prizeMoney.currency) ? c === "Other" : ev.prizeMoney?.currency === c) ? "selected" : ""}>${c}</option>`).join("")}
          </select>
        </div>
        <div class="field" id="prize-other-field" style="display:none">
          <label>Specify currency</label>
          <input type="text" name="prizeCurrencyOther" placeholder="e.g. GBP" value="${escapeHtml(ev.prizeMoney?.currency && !["INR","USD","EUR"].includes(ev.prizeMoney.currency) ? ev.prizeMoney.currency : "")}" />
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Team members <span class="muted small">(besides you — you're automatically included)</span></h3>
      <div class="field">
        <div class="radio-group" id="member-kind">
          <label><input type="radio" name="mkind" value="registered" checked /> Registered on HIVE</label>
          <label><input type="radio" name="mkind" value="srit-pending" /> SRIT student/faculty (not registered yet)</label>
          <label><input type="radio" name="mkind" value="external" /> Other college</label>
        </div>
      </div>
      <div id="member-input-zone"></div>
      <div id="member-list" style="margin-top:14px"></div>
    </div>

    <div class="card">
      <h3>Faculty mentors <span class="muted small">(optional — add one or more)</span></h3>
      <div class="field">
        <div class="radio-group" id="mentor-kind">
          <label><input type="radio" name="mtkind" value="registered" checked /> Registered on HIVE</label>
          <label><input type="radio" name="mtkind" value="srit-pending" /> Not registered yet (SRIT official mail)</label>
        </div>
      </div>
      <div id="mentor-input-zone"></div>
      <div id="mentor-display" style="margin-top:10px"></div>
    </div>

    <div class="card">
      <h3>Dates to track</h3>
      <div id="dates-list"></div>
      <div class="date-track-row">
        <input type="text" id="date-label" placeholder="Label (e.g. Submission deadline)" />
        <input type="date" id="date-value" />
        <button class="btn btn-ghost btn-sm" type="button" id="add-date">＋ Add</button>
      </div>
    </div>

    <div class="modal-actions" style="justify-content:flex-end">
      <a class="btn btn-ghost" href="#/events">Cancel</a>
      <button class="btn btn-primary" type="submit" id="save-btn">${editId ? "Save changes" : "Add event"}</button>
    </div>
  </form>`;

  const form = el.querySelector("#event-form");

  /* ---------- event type "Other" toggle ---------- */
  const typeSel = form.querySelector('select[name="eventType"]');
  const otherField = el.querySelector("#other-type-field");
  function syncOther() { otherField.style.display = typeSel.value === "Other" ? "flex" : "none"; }
  if (ev.eventType && !EVENT_TYPES.includes(ev.eventType)) typeSel.value = "Other";
  typeSel.onchange = syncOther; syncOther();

  /* ---------- prize money show/hide ---------- */
  const prizeCurrencySel = form.querySelector('select[name="prizeCurrency"]');
  function syncPrize() {
    const yes = form.querySelector('input[name="hasPrize"]:checked')?.value === "yes";
    el.querySelector("#prize-amount-field").style.display = yes ? "flex" : "none";
    el.querySelector("#prize-currency-field").style.display = yes ? "flex" : "none";
    el.querySelector("#prize-other-field").style.display =
      yes && prizeCurrencySel.value === "Other" ? "flex" : "none";
  }
  form.querySelectorAll('input[name="hasPrize"]').forEach((r) => { r.onchange = syncPrize; });
  prizeCurrencySel.onchange = syncPrize;
  syncPrize();

  /* ---------- event name autocomplete ---------- */
  const nameInput = el.querySelector("#event-name");
  const suggestBox = el.querySelector("#name-suggest");
  const hint = el.querySelector("#opp-link-hint");

  const doSuggest = debounce(async () => {
    const v = nameInput.value.trim();
    if (v.length < 2) { suggestBox.style.display = "none"; return; }
    try {
      const [opps, parts] = await Promise.all([
        searchOpportunities(v), searchParticipationNames(v),
      ]);
      const items = [];
      const seen = new Set();
      for (const o of opps) {
        if (seen.has(o.nameLower)) continue;
        seen.add(o.nameLower);
        items.push({ name: o.name, sub: `📢 Posted event · ${o.type || ""}`, oppId: o.id, type: o.type });
      }
      for (const pt of parts) {
        if (seen.has(pt.eventNameLower)) continue;
        seen.add(pt.eventNameLower);
        items.push({ name: pt.eventName, sub: `👥 Tracked by other teams · ${pt.eventType || ""}`, oppId: pt.opportunityId || null, type: pt.eventType });
      }
      if (!items.length) { suggestBox.style.display = "none"; return; }
      suggestBox.innerHTML = items.slice(0, 8).map((it, i) =>
        `<div class="autocomplete-item" data-i="${i}"><div>${escapeHtml(it.name)}</div><div class="sub">${escapeHtml(it.sub)}</div></div>`).join("");
      suggestBox.style.display = "block";
      suggestBox.querySelectorAll(".autocomplete-item").forEach((n) => {
        n.onclick = () => {
          const it = items[Number(n.dataset.i)];
          nameInput.value = it.name;
          state.opportunityId = it.oppId || null;
          if (it.type && EVENT_TYPES.includes(it.type)) { typeSel.value = it.type; syncOther(); }
          hint.textContent = state.opportunityId
            ? "🔗 Linked to a posted event — faculty can filter participants by it."
            : "Matched an event name other teams are tracking.";
          suggestBox.style.display = "none";
        };
      });
    } catch (e) { console.warn(e); }
  }, 300);

  nameInput.addEventListener("input", () => { state.opportunityId = null; doSuggest(); });
  document.addEventListener("click", (e) => {
    if (!suggestBox.contains(e.target) && e.target !== nameInput) suggestBox.style.display = "none";
  });

  /* ---------- team members ---------- */
  const inputZone = el.querySelector("#member-input-zone");
  const memberListEl = el.querySelector("#member-list");
  let memberKind = "registered";

  el.querySelectorAll('#member-kind input[name="mkind"]').forEach((r) => {
    r.onchange = () => { memberKind = r.value; drawMemberInput(); };
  });

  function drawMemberInput() {
    if (memberKind === "registered") {
      inputZone.innerHTML = `
        <div class="autocomplete-wrap">
          <input type="text" id="user-search" autocomplete="off" placeholder="Search by name…" />
          <div class="autocomplete-list" id="user-suggest" style="display:none"></div>
        </div>
        <span class="hint muted small">The event will automatically appear in their My Events.</span>`;
      const inp = inputZone.querySelector("#user-search");
      const box = inputZone.querySelector("#user-suggest");
      const search = debounce(async () => {
        const v = inp.value.trim();
        if (v.length < 2) { box.style.display = "none"; return; }
        const users = (await searchUsersByName(v)).filter((u) =>
          u.id !== session.user.uid && !state.members.some((m) => m.uid === u.id));
        if (!users.length) { box.style.display = "none"; return; }
        box.innerHTML = users.map((u, i) =>
          `<div class="autocomplete-item" data-i="${i}"><div>${escapeHtml(u.name)}${u.role === "faculty" ? ' <span class="badge badge-broadcast">faculty</span>' : ""}</div><div class="sub">${escapeHtml(u.role === "faculty" ? [u.department, "Faculty"].filter(Boolean).join(" · ") : [u.registerNumber, u.department, u.year && "Year " + u.year].filter(Boolean).join(" · "))}</div></div>`).join("");
        box.style.display = "block";
        box.querySelectorAll(".autocomplete-item").forEach((n) => {
          n.onclick = () => {
            const u = users[Number(n.dataset.i)];
            state.members.push({ type: "registered", uid: u.id, name: u.name, email: u.authEmail, role: u.role || "student" });
            inp.value = ""; box.style.display = "none";
            drawMembers();
          };
        });
      }, 300);
      inp.addEventListener("input", search);
    } else if (memberKind === "srit-pending") {
      inputZone.innerHTML = `
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <input type="text" id="pm-name" placeholder="Their name" style="flex:1; min-width:160px" />
          <input type="email" id="pm-email" placeholder="their.name@${escapeHtml(ALLOWED_DOMAIN)}" style="flex:1.4; min-width:200px" />
          <button class="btn btn-ghost" type="button" id="pm-add">＋ Add</button>
        </div>
        <span class="hint muted small">When they register on HIVE with this email, this event will appear in their history automatically.</span>`;
      inputZone.querySelector("#pm-add").onclick = () => {
        const name = inputZone.querySelector("#pm-name").value.trim();
        const email = normEmail(inputZone.querySelector("#pm-email").value);
        if (!name || !email) { toast("Enter both name and email.", "error"); return; }
        if (!isSritEmail(email)) { toast(`SRIT teammates need an @${ALLOWED_DOMAIN} email.`, "error"); return; }
        if (state.members.some((m) => normEmail(m.email) === email)) { toast("Already added.", "error"); return; }
        state.members.push({ type: "srit-pending", name, email });
        inputZone.querySelector("#pm-name").value = ""; inputZone.querySelector("#pm-email").value = "";
        drawMembers();
      };
    } else {
      inputZone.innerHTML = `
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <input type="text" id="xm-name" placeholder="Their name" style="flex:1; min-width:160px" />
          <input type="email" id="xm-email" placeholder="Personal email" style="flex:1.4; min-width:200px" />
          <button class="btn btn-ghost" type="button" id="xm-add">＋ Add</button>
        </div>
        <span class="hint muted small">Teammate from another college — stored for records only.</span>`;
      inputZone.querySelector("#xm-add").onclick = () => {
        const name = inputZone.querySelector("#xm-name").value.trim();
        const email = normEmail(inputZone.querySelector("#xm-email").value);
        if (!name || !email) { toast("Enter both name and email.", "error"); return; }
        state.members.push({ type: "external", name, email });
        inputZone.querySelector("#xm-name").value = ""; inputZone.querySelector("#xm-email").value = "";
        drawMembers();
      };
    }
  }

  function memberTag(m) {
    const fac = m.role === "faculty" ? ' <span class="badge badge-broadcast">faculty</span>' : "";
    if (m.type === "registered") return '<span class="badge badge-won">HIVE user</span>' + fac;
    if (m.type === "srit-pending") return '<span class="badge badge-active">SRIT · pending signup</span>';
    return '<span class="badge badge-neutral">Other college</span>';
  }

  function drawMembers() {
    memberListEl.innerHTML = state.members.length
      ? state.members.map((m, i) => `
        <div class="member-row">
          <div class="avatar">${escapeHtml((m.name || "?")[0].toUpperCase())}</div>
          <div class="who">
            <div class="nm">${escapeHtml(m.name)} ${memberTag(m)}</div>
            <div class="em">${escapeHtml(m.email || "")}</div>
          </div>
          <button class="btn btn-ghost btn-sm" type="button" data-rm="${i}">Remove</button>
        </div>`).join("")
      : '<p class="muted small">No teammates added — solo participation.</p>';
    memberListEl.querySelectorAll("[data-rm]").forEach((b) => {
      b.onclick = () => { state.members.splice(Number(b.dataset.rm), 1); drawMembers(); };
    });
  }

  drawMemberInput();
  drawMembers();

  /* ---------- faculty mentor ---------- */
  const mentorZone = el.querySelector("#mentor-input-zone");
  const mentorDisplay = el.querySelector("#mentor-display");
  let mentorKind = "registered";

  el.querySelectorAll('#mentor-kind input[name="mtkind"]').forEach((r) => {
    r.onchange = () => { mentorKind = r.value; drawMentorInput(); };
  });

  function drawMentorInput() {
    if (mentorKind === "registered") {
      mentorZone.innerHTML = `
        <div class="autocomplete-wrap">
          <input type="text" id="mentor-search" autocomplete="off" placeholder="Search faculty by name…" />
          <div class="autocomplete-list" id="mentor-suggest" style="display:none"></div>
        </div>`;
      const inp = mentorZone.querySelector("#mentor-search");
      const box = mentorZone.querySelector("#mentor-suggest");
      const search = debounce(async () => {
        const v = inp.value.trim();
        if (v.length < 2) { box.style.display = "none"; return; }
        let fac;
        try {
          // also allow finding a faculty member by their exact email
          if (v.includes("@")) {
            const u = await findUserByEmail(v);
            fac = u && u.role === "faculty" ? [u] : [];
          } else {
            fac = await searchFacultyByName(v);
          }
        } catch (e) {
          console.error("faculty search failed", e);
          toast("Faculty search failed: " + e.message, "error");
          box.style.display = "none";
          return;
        }
        fac = fac.filter((u) => !state.mentors.some((m) => m.uid === u.id));
        if (!fac.length) {
          box.innerHTML = `<div class="autocomplete-item" style="cursor:default"><div class="sub">No registered faculty matches "${escapeHtml(v)}" — if they haven't joined HIVE yet, use the "Not registered yet" option above.</div></div>`;
          box.style.display = "block";
          return;
        }
        box.innerHTML = fac.map((u, i) =>
          `<div class="autocomplete-item" data-i="${i}"><div>${escapeHtml(u.name)}</div><div class="sub">${escapeHtml([u.department, "Faculty"].filter(Boolean).join(" · "))}</div></div>`).join("");
        box.style.display = "block";
        box.querySelectorAll(".autocomplete-item").forEach((n) => {
          n.onclick = () => {
            const u = fac[Number(n.dataset.i)];
            state.mentors.push({ type: "registered", uid: u.id, name: u.name, email: u.authEmail });
            inp.value = ""; box.style.display = "none";
            drawMentor();
          };
        });
      }, 300);
      inp.addEventListener("input", search);
    } else {
      mentorZone.innerHTML = `
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <input type="text" id="mt-name" placeholder="Mentor's name" style="flex:1; min-width:160px" />
          <input type="email" id="mt-email" placeholder="their.name@${escapeHtml(ALLOWED_DOMAIN)}" style="flex:1.4; min-width:200px" />
          <button class="btn btn-ghost" type="button" id="mt-add">＋ Add mentor</button>
        </div>`;
      mentorZone.querySelector("#mt-add").onclick = () => {
        const name = mentorZone.querySelector("#mt-name").value.trim();
        const email = normEmail(mentorZone.querySelector("#mt-email").value);
        if (!name || !email) { toast("Enter the mentor's name and email.", "error"); return; }
        if (!isSritEmail(email)) { toast(`Mentor's email must be @${ALLOWED_DOMAIN}.`, "error"); return; }
        if (state.mentors.some((m) => normEmail(m.email) === email)) { toast("Already added.", "error"); return; }
        state.mentors.push({ type: "srit-pending", name, email });
        mentorZone.querySelector("#mt-name").value = ""; mentorZone.querySelector("#mt-email").value = "";
        drawMentor();
      };
    }
  }

  function drawMentor() {
    mentorDisplay.innerHTML = state.mentors.length ? state.mentors.map((m, i) => `
      <div class="member-row">
        <div class="avatar">${escapeHtml((m.name || "?")[0].toUpperCase())}</div>
        <div class="who">
          <div class="nm">${escapeHtml(m.name)} <span class="badge badge-broadcast">mentor</span>
            ${m.type === "srit-pending" ? '<span class="badge badge-active">pending signup</span>' : ""}</div>
          <div class="em">${escapeHtml(m.email || "")}</div>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" data-mt-rm="${i}">Remove</button>
      </div>`).join("") : '<p class="muted small">No mentors set.</p>';
    mentorDisplay.querySelectorAll("[data-mt-rm]").forEach((b) => {
      b.onclick = () => { state.mentors.splice(Number(b.dataset.mtRm), 1); drawMentor(); };
    });
  }

  drawMentorInput();
  drawMentor();

  /* ---------- dates to track ---------- */
  const datesList = el.querySelector("#dates-list");
  function drawDates() {
    datesList.innerHTML = state.datesToTrack.length
      ? state.datesToTrack.map((d, i) => `
        <div class="member-row">
          <div class="who"><span class="nm">${escapeHtml(d.label)}</span> <span class="muted small">— ${escapeHtml(d.date)}</span></div>
          <button class="btn btn-ghost btn-sm" type="button" data-rd="${i}">Remove</button>
        </div>`).join("")
      : "";
    datesList.querySelectorAll("[data-rd]").forEach((b) => {
      b.onclick = () => { state.datesToTrack.splice(Number(b.dataset.rd), 1); drawDates(); };
    });
  }
  drawDates();
  el.querySelector("#add-date").onclick = () => {
    const label = el.querySelector("#date-label").value.trim();
    const date = el.querySelector("#date-value").value;
    if (!label || !date) { toast("Enter a label and pick a date.", "error"); return; }
    state.datesToTrack.push({ label, date });
    el.querySelector("#date-label").value = ""; el.querySelector("#date-value").value = "";
    drawDates();
  };

  /* ---------- submit ---------- */
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = el.querySelector("#save-btn");
    btn.disabled = true; btn.textContent = "Saving…";
    const data = Object.fromEntries(new FormData(form));
    const eventType = data.eventType === "Other" && data.eventTypeOther?.trim()
      ? data.eventTypeOther.trim() : data.eventType;
    const payload = {
      eventName: data.eventName.trim(),
      eventType,
      opportunityId: state.opportunityId,
      teamSize: Number(data.teamSize),
      members: state.members,
      currentStatus: data.currentStatus,
      overallStatus: data.overallStatus,
      datesToTrack: state.datesToTrack,
      mentors: state.mentors,
      prizeMoney: data.hasPrize === "yes" && Number(data.prizeAmount) > 0
        ? {
            amount: Number(data.prizeAmount),
            currency: data.prizeCurrency === "Other"
              ? (data.prizeCurrencyOther?.trim() || "Other") : data.prizeCurrency,
          }
        : null,
    };
    try {
      if (editId) {
        await updateParticipation(editId, payload);
        toast("Event updated ✅", "success");
        location.hash = `#/events/${editId}`;
      } else {
        await createParticipation(payload);
        toast("Event added to your tracker 🎉 You can find it in My Events.", "success", 5000);
        location.hash = "#/events";
      }
    } catch (err) {
      toast(err.message, "error");
      btn.disabled = false; btn.textContent = editId ? "Save changes" : "Add event";
    }
  };
}
