// Event detail — full view of one participation, quick status update, edit/delete.
import { session, isFaculty } from "../lib/auth.js";
import { getParticipation, updateParticipation, deleteParticipation, getOpportunity } from "../lib/db.js";
import { certUploadsEnabled, openCertUploader, reconcileCertUploads, deleteCertificate, deletePhoto, driveThumb } from "../lib/certificates.js";
import { spinner, escapeHtml, statusBadge, typeBadge, fmtDate, fmtDateTime, toast, confirmDialog } from "../lib/ui.js";

export async function renderEventDetail(el, params) {
  const id = params[0];
  el.innerHTML = spinner("Loading event…");

  let ev;
  try { ev = await getParticipation(id); }
  catch { el.innerHTML = "<p>Event not found (it may have been deleted).</p>"; return; }

  const canEdit = ev.memberUids?.includes(session.user.uid) || isFaculty();

  // pick up certificates uploaded via the Google Drive page since last visit
  if (canEdit && certUploadsEnabled()) {
    try {
      const attached = await reconcileCertUploads(ev.id);
      if (attached) {
        toast(`${attached} new certificate${attached > 1 ? "s" : ""} attached 📜`, "success");
        ev = await getParticipation(id);
      }
    } catch (e) { console.warn("cert reconcile", e); }
  }

  const opp = ev.opportunityId ? await getOpportunity(ev.opportunityId) : null;
  const today = new Date().toISOString().slice(0, 10);

  el.innerHTML = `
  <div class="page-head">
    <div>
      <h1>${escapeHtml(ev.eventName)}</h1>
      <div class="sub">${typeBadge(ev.eventType)} ${statusBadge(ev.overallStatus)}</div>
    </div>
    <div style="display:flex; gap:8px">
      <a class="btn btn-ghost" href="#/events">← Back</a>
      ${canEdit ? `<a class="btn btn-ghost" href="#/events/${ev.id}/edit">✏️ Edit</a>
      <button class="btn btn-danger" id="del-btn">Delete</button>` : ""}
    </div>
  </div>

  <div class="grid grid-2">
    <div>
      <div class="card">
        <h3>Details</h3>
        <dl class="detail-list">
          <dt>Team size</dt><dd>${ev.teamSize || 1}</dd>
          <dt>Overall status</dt><dd>${statusBadge(ev.overallStatus)}</dd>
          <dt>Current progress</dt><dd>${escapeHtml(ev.currentStatus || "—")}</dd>
          <dt>Faculty mentor</dt><dd>${ev.mentor ? `${escapeHtml(ev.mentor.name)}${ev.mentor.type === "srit-pending" ? ' <span class="badge badge-active">pending signup</span>' : ""}<div class="muted small">${escapeHtml(ev.mentor.email || "")}</div>` : '<span class="muted">—</span>'}</dd>
          ${ev.prizeMoney?.amount ? `<dt>💰 Prize money</dt><dd><strong>${escapeHtml(String(ev.prizeMoney.amount))} ${escapeHtml(ev.prizeMoney.currency || "INR")}</strong></dd>` : ""}
          <dt>Added by</dt><dd>${escapeHtml(ev.createdByName || "—")}</dd>
          <dt>Added on</dt><dd>${fmtDateTime(ev.createdAt)}</dd>
          <dt>Last updated</dt><dd>${fmtDateTime(ev.updatedAt)}</dd>
          ${opp ? `<dt>Linked event</dt><dd>📢 ${escapeHtml(opp.name)}${opp.registrationLink ? ` · <a href="${escapeHtml(opp.registrationLink)}" target="_blank" rel="noopener">registration link ↗</a>` : ""}</dd>` : ""}
        </dl>
      </div>

      ${canEdit ? `
      <div class="card">
        <h3>Quick status update</h3>
        <form id="quick-form" style="display:flex; flex-direction:column; gap:10px">
          <div class="field">
            <label>Overall status</label>
            <select name="overallStatus">
              ${["active", "won", "lost"].map((s) => `<option ${ev.overallStatus === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Current progress</label>
            <textarea name="currentStatus">${escapeHtml(ev.currentStatus || "")}</textarea>
          </div>
          <button class="btn btn-primary" type="submit">Update</button>
        </form>
      </div>` : ""}
    </div>

    <div>
      <div class="card">
        <h3>Team</h3>
        <div class="member-row">
            <div class="avatar">${escapeHtml((ev.createdByName || "?")[0].toUpperCase())}</div>
            <div class="who"><div class="nm">${escapeHtml(ev.createdByName || "Creator")} <span class="badge badge-type">owner</span></div></div>
          </div>
          ${(ev.members || []).map((m) => `
            <div class="member-row">
              <div class="avatar">${escapeHtml((m.name || "?")[0].toUpperCase())}</div>
              <div class="who">
                <div class="nm">${escapeHtml(m.name)} ${
                  m.type === "registered" ? '<span class="badge badge-won">HIVE user</span>'
                  : m.type === "srit-pending" ? '<span class="badge badge-active">pending signup</span>'
                  : '<span class="badge badge-neutral">other college</span>'}${m.role === "faculty" ? ' <span class="badge badge-broadcast">faculty</span>' : ""}</div>
                <div class="em">${escapeHtml(m.email || "")}</div>
              </div>
            </div>`).join("")}
      </div>

      <div class="card">
        <h3>📸 Event photos <span class="muted small">(optional — skip for virtual events)</span></h3>
        ${(ev.photos || []).length ? `
        <div class="photo-grid">
          ${ev.photos.map((p, i) => `
            <div class="photo-item">
              <a href="${escapeHtml(p.url)}" target="_blank" rel="noopener" title="${escapeHtml(p.label)}">
                <img src="${driveThumb(p.fileId)}" alt="${escapeHtml(p.label)}" loading="lazy"
                     onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'photo-fallback',textContent:'🖼️ ' + this.alt}))" />
              </a>
              ${(p.uploadedBy === session.user.uid || isFaculty()) ? `<button class="photo-x" data-photo-del="${i}" title="Remove">✕</button>` : ""}
            </div>`).join("")}
        </div>` : '<p class="muted small">No photos yet — add one of you on stage, presenting, or receiving the award!</p>'}
        ${canEdit ? (certUploadsEnabled() ? `
          <button class="btn btn-ghost btn-sm" type="button" id="photo-open" style="margin-top:10px">📸 Upload photos</button>
        ` : "") : ""}
      </div>

      <div class="card">
        <h3>📜 Certificates</h3>
        <div id="cert-list">
          ${(ev.certificates || []).length
            ? ev.certificates.map((c, i) => `
              <div class="member-row">
                <div class="who">
                  <span class="nm">${escapeHtml(c.label)}</span>
                  <span class="badge ${c.kind === "winner" ? "badge-won" : c.kind === "participation" ? "badge-active" : "badge-neutral"}">${escapeHtml(c.kind)}</span>
                  <div class="em">by ${escapeHtml(c.uploadedByName || "")} · ${fmtDate(c.uploadedAt)}</div>
                </div>
                <a class="btn btn-ghost btn-sm" href="${escapeHtml(c.url)}" target="_blank" rel="noopener">View ↗</a>
                ${(c.uploadedBy === session.user.uid || isFaculty()) ? `<button class="btn btn-ghost btn-sm" data-cert-del="${i}" style="color:var(--red)">✕</button>` : ""}
              </div>`).join("")
            : '<p class="muted small">No certificates uploaded yet.</p>'}
        </div>
        ${canEdit ? (certUploadsEnabled() ? `
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px; border-top:1px dashed var(--border); padding-top:12px">
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" type="button" id="cert-open">⬆ Upload certificate</button>
            <button class="btn btn-ghost btn-sm" type="button" id="cert-refresh">🔄 Check for new uploads</button>
          </div>
          <span class="hint muted small">Opens the college Drive uploader in a new tab (sign in with your SRIT Google account). You can upload as many certificates as you need — after uploading, come back and they'll appear here.</span>
        </div>` : '<p class="hint muted small" style="margin-top:10px">Certificate uploads are not configured yet — ask the admin team.</p>') : ""}
      </div>

      <div class="card">
        <h3>Dates to track</h3>
        ${(ev.datesToTrack || []).length
          ? (ev.datesToTrack).slice().sort((a, b) => a.date.localeCompare(b.date)).map((d) => `
            <div class="member-row">
              <div class="who">
                <span class="nm">${escapeHtml(d.label)}</span>
                <div class="em">${fmtDate(d.date)} ${d.date < today ? '<span class="badge badge-neutral">past</span>' : d.date === today ? '<span class="badge badge-won">today</span>' : '<span class="badge badge-active">upcoming</span>'}</div>
              </div>
            </div>`).join("")
          : '<p class="muted small">No dates added.</p>'}
      </div>
    </div>
  </div>`;

  /* ---- certificates & photos ---- */
  el.querySelector("#cert-open")?.addEventListener("click", () => {
    openCertUploader(ev.id, ev.eventName, "cert");
    toast("Uploader opened in a new tab. Come back here after uploading.", "info", 5000);
  });

  el.querySelector("#photo-open")?.addEventListener("click", () => {
    openCertUploader(ev.id, ev.eventName, "photo");
    toast("Photo uploader opened in a new tab. Come back here after uploading.", "info", 5000);
  });

  el.querySelectorAll("[data-photo-del]").forEach((b) => {
    b.onclick = async () => {
      const photo = ev.photos[Number(b.dataset.photoDel)];
      const ok = await confirmDialog(`Remove this photo (${photo.label})?`, { danger: true, okText: "Remove" });
      if (!ok) return;
      try {
        await deletePhoto(ev.id, photo);
        toast("Photo removed", "success");
        renderEventDetail(el, params);
      } catch (err) { toast(err.message, "error"); }
    };
  });

  el.querySelector("#cert-refresh")?.addEventListener("click", async () => {
    const n = await reconcileCertUploads(ev.id);
    if (n) renderEventDetail(el, params);
    else toast("No new uploads found yet. Finish the upload in the other tab first.", "info");
  });

  el.querySelectorAll("[data-cert-del]").forEach((b) => {
    b.onclick = async () => {
      const cert = ev.certificates[Number(b.dataset.certDel)];
      const ok = await confirmDialog(`Remove certificate "${cert.label}"?`, { danger: true, okText: "Remove" });
      if (!ok) return;
      try {
        await deleteCertificate(ev.id, cert);
        toast("Certificate removed", "success");
        renderEventDetail(el, params);
      } catch (err) { toast(err.message, "error"); }
    };
  });

  if (canEdit) {
    el.querySelector("#quick-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target));
      try {
        await updateParticipation(ev.id, { overallStatus: data.overallStatus, currentStatus: data.currentStatus });
        toast("Status updated", "success");
        renderEventDetail(el, params);
      } catch (err) { toast(err.message, "error"); }
    });

    el.querySelector("#del-btn")?.addEventListener("click", async () => {
      const ok = await confirmDialog(`Delete "${ev.eventName}"? This removes it for the whole team.`, { danger: true, okText: "Delete" });
      if (!ok) return;
      try {
        await deleteParticipation(ev.id);
        toast("Event deleted", "success");
        location.hash = "#/events";
      } catch (err) { toast(err.message, "error"); }
    });
  }
}
