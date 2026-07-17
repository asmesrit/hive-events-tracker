// Opportunities — notification feed of posted events.
// Faculty posts are broadcasts (highlighted); students can post events they
// come across (name + registration link + notes). "Track this event" jumps
// to the participation form pre-linked to the opportunity.
import { session, isFaculty } from "../lib/auth.js";
import { listOpportunities, createOpportunity, updateOpportunity, deleteOpportunity, EVENT_TYPES } from "../lib/db.js";
import { spinner, emptyState, escapeHtml, fmtDateTime, toast, openModal, closeModal, confirmDialog, debounce } from "../lib/ui.js";

export async function renderOpportunities(el) {
  el.innerHTML = spinner("Loading opportunities…");
  let opps;
  try { opps = await listOpportunities(); }
  catch (err) { el.innerHTML = `<p class="muted">Could not load: ${escapeHtml(err.message)}</p>`; return; }

  const faculty = isFaculty();

  el.innerHTML = `
  <div class="page-head">
    <div><h1>Opportunities</h1><div class="sub">Events posted by faculty and fellow students</div></div>
    <button class="btn btn-primary" id="post-btn">＋ Post an event</button>
  </div>
  <div class="filter-bar">
    <input type="search" id="f-text" placeholder="Search posted events…" />
    <select id="f-who">
      <option value="">All posts</option>
      <option value="broadcast">📢 Faculty broadcasts</option>
      <option value="student">Student posts</option>
    </select>
    <select id="f-life">
      <option value="live">Live only</option>
      <option value="expired">⏳ Expired only</option>
      <option value="">Everything</option>
    </select>
  </div>
  <div id="opp-list" class="grid" style="grid-template-columns:1fr"></div>`;

  const listEl = el.querySelector("#opp-list");

  const today = new Date().toISOString().slice(0, 10);
  const isExpired = (o) => !!o.expiresOn && o.expiresOn < today;

  function draw() {
    const text = el.querySelector("#f-text").value.toLowerCase();
    const who = el.querySelector("#f-who").value;
    const life = el.querySelector("#f-life").value;
    const filtered = opps.filter((o) =>
      (!text || o.name.toLowerCase().includes(text)) &&
      (!who || (who === "broadcast" ? o.isBroadcast : !o.isBroadcast)) &&
      (!life || (life === "expired" ? isExpired(o) : !isExpired(o))));

    if (!filtered.length) {
      listEl.innerHTML = emptyState("🔔", "No opportunities posted yet", "Be the first to share an event you came across!");
      return;
    }

    listEl.innerHTML = filtered.map((o) => `
      <div class="card notif-card ${isExpired(o) ? "notif-expired" : ""}">
        <div class="notif-icon">${o.isBroadcast ? "📢" : "💡"}</div>
        <div class="notif-body">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap">
            <strong>${escapeHtml(o.name)}</strong>
            ${o.isBroadcast ? '<span class="badge badge-broadcast">Faculty broadcast</span>' : ""}
            <span class="badge badge-type">${escapeHtml(o.type || "Event")}</span>
            ${isExpired(o) ? '<span class="badge badge-neutral">⏳ Expired</span>' : ""}
          </div>
          ${o.notes ? `<p class="muted small" style="margin-top:4px">${escapeHtml(o.notes)}</p>` : ""}
          <div class="notif-meta">Posted by ${escapeHtml(o.postedByName || "someone")} · ${fmtDateTime(o.createdAt)}${o.expiresOn ? ` · ${isExpired(o) ? "expired" : "valid till"} ${escapeHtml(o.expiresOn)}` : ""}</div>
          <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap">
            ${o.registrationLink ? `<a class="btn btn-ghost btn-sm" href="${escapeHtml(o.registrationLink)}" target="_blank" rel="noopener">Register ↗</a>` : ""}
            <button class="btn btn-primary btn-sm" data-track="${o.id}">🎯 Track this event</button>
            ${(faculty || o.postedBy === session.user.uid) ? `
              <button class="btn btn-ghost btn-sm" data-edit="${o.id}">Edit</button>
              <button class="btn btn-ghost btn-sm" data-del="${o.id}" style="color:var(--red)">Delete</button>` : ""}
          </div>
        </div>
      </div>`).join("");

    listEl.querySelectorAll("[data-track]").forEach((b) => {
      b.onclick = () => {
        // The event form reads this and pre-links the participation.
        sessionStorage.setItem("hive.trackOpportunity", b.dataset.track);
        location.hash = "#/events/new";
      };
    });
    listEl.querySelectorAll("[data-edit]").forEach((b) => {
      b.onclick = () => openPostModal(opps.find((o) => o.id === b.dataset.edit));
    });
    listEl.querySelectorAll("[data-del]").forEach((b) => {
      b.onclick = async () => {
        const o = opps.find((x) => x.id === b.dataset.del);
        const ok = await confirmDialog(`Delete the posted event "${o.name}"?`, { danger: true, okText: "Delete" });
        if (!ok) return;
        await deleteOpportunity(o.id);
        toast("Post removed", "success");
        renderOpportunities(el);
      };
    });
  }

  function openPostModal(existing = null) {
    const modal = openModal(`
      <h3>${existing ? "Edit posted event" : "Post an event"}</h3>
      <form id="opp-form" style="display:flex; flex-direction:column; gap:12px; margin-top:8px">
        <div class="field">
          <label>Event name</label>
          <input type="text" name="name" required value="${escapeHtml(existing?.name || "")}" placeholder="e.g. Smart India Hackathon 2026" />
        </div>
        <div class="field">
          <label>Type</label>
          <select name="type">${EVENT_TYPES.map((t) => `<option ${existing?.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
        </div>
        <div class="field">
          <label>Registration link</label>
          <input type="url" name="registrationLink" value="${escapeHtml(existing?.registrationLink || "")}" placeholder="https://…" />
        </div>
        <div class="field">
          <label>Notes</label>
          <textarea name="notes" placeholder="Eligibility, deadlines, anything useful…">${escapeHtml(existing?.notes || "")}</textarea>
        </div>
        <div class="field">
          <label>Valid till <span class="muted small">(registration deadline or event date — post shows as Expired after this)</span></label>
          <input type="date" name="expiresOn" value="${escapeHtml(existing?.expiresOn || "")}" />
        </div>
        ${faculty ? `<label class="checkbox-row"><input type="checkbox" name="isBroadcast" ${existing?.isBroadcast || !existing ? "checked" : ""}/> 📢 Broadcast to all students</label>` : ""}
        <div class="modal-actions">
          <button class="btn btn-ghost" type="button" id="opp-cancel">Cancel</button>
          <button class="btn btn-primary" type="submit">${existing ? "Save" : "Post"}</button>
        </div>
      </form>`);
    modal.querySelector("#opp-cancel").onclick = closeModal;
    modal.querySelector("#opp-form").onsubmit = async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      const payload = {
        name: data.name.trim(),
        type: data.type,
        registrationLink: data.registrationLink?.trim() || "",
        notes: data.notes?.trim() || "",
        expiresOn: data.expiresOn || null,
        isBroadcast: faculty ? data.isBroadcast === "on" : false,
      };
      try {
        if (existing) await updateOpportunity(existing.id, payload);
        else await createOpportunity(payload);
        closeModal();
        toast(existing ? "Post updated" : "Event posted 🔔", "success");
        renderOpportunities(el);
      } catch (err) { toast(err.message, "error"); }
    };
  }

  el.querySelector("#post-btn").onclick = () => openPostModal();
  draw();
  el.querySelector("#f-text").addEventListener("input", debounce(draw, 150));
  el.querySelector("#f-who").addEventListener("input", draw);
}
