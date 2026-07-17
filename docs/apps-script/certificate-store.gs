/**
 * HIVE Events Tracker — Certificate & photo uploader (Google Apps Script)
 * -----------------------------------------------------------------------
 * Works with Workspace-restricted access ("Anyone within sritcbe.ac.in").
 * HIVE opens this web app in a new tab; the student (signed in to their
 * SRIT Google account) uploads certificates or event photos here. Files
 * are saved to this account's Drive and metadata is written to the
 * Firestore staging collection (`certUploads`) that HIVE reconciles.
 *
 * DEPLOY / UPDATE:
 *  1. Paste this ENTIRE file over the old code at script.google.com.
 *  2. SHARED_TOKEN must match CERT_UPLOAD_TOKEN in firebase-config.js.
 *  3. Deploy → Manage deployments → ✏ → Version: New version → Deploy.
 *     (Execute as: Me · Who has access: Anyone within sritcbe.ac.in)
 */

const SHARED_TOKEN = "asdfghjkl123456zxcvbnm456789"; // must match firebase-config.js
const FOLDER_NAME = "HIVE Certificates";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
const FIREBASE_PROJECT_ID = "hive-events-tracker";
const FIREBASE_API_KEY = "AIzaSyAUBvsHEM3T3dCKVd_ggj46BYl-6ow6mjo"; // public web API key

/** Upload page. HIVE opens: <exec-url>?token=...&partId=...&event=...&mode=cert|photo */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.token !== SHARED_TOKEN || !p.partId) {
    return HtmlService.createHtmlOutput(
      "<h3 style='font-family:sans-serif'>⛔ Invalid link</h3><p style='font-family:sans-serif'>Open this page from the HIVE app (Event → Upload).</p>");
  }
  const t = HtmlService.createTemplate(PAGE_HTML);
  t.partId = p.partId;
  t.eventName = p.event || "your event";
  t.mode = p.mode === "photo" ? "photo" : "cert";
  t.token = SHARED_TOKEN;
  return t.evaluate()
    .setTitle("HIVE — Upload")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/** Called from the page per file (base64). Returns {url, fileName}. */
function uploadFile(payload) {
  if (!payload || payload.token !== SHARED_TOKEN) throw new Error("Unauthorized.");
  const kind = String(payload.kind || "participation");
  const mime = String(payload.mimeType || "");
  const isPhoto = kind === "photo";
  if (isPhoto && !/^image\/(jpeg|png|webp)$/.test(mime)) {
    throw new Error("Photos must be JPG, PNG or WEBP images.");
  }
  if (!isPhoto && !/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(mime)) {
    throw new Error("Only JPG, PNG, WEBP or PDF files are allowed.");
  }
  const bytes = Utilities.base64Decode(payload.data);
  if (bytes.length > MAX_BYTES) throw new Error("File is larger than 10 MB.");

  const email = Session.getActiveUser().getEmail() || "";
  const folder = getSubfolder(getFolder(), String(payload.partId));
  const file = folder.createFile(Utilities.newBlob(bytes, mime, String(payload.fileName || "upload")));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (err) {
    try { file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (err2) {}
  }
  const url = "https://drive.google.com/file/d/" + file.getId() + "/view";

  const body = {
    fields: {
      partId: { stringValue: String(payload.partId) },
      kind: { stringValue: kind },
      label: { stringValue: String(payload.label || file.getName()) },
      url: { stringValue: url },
      fileId: { stringValue: file.getId() },
      fileName: { stringValue: file.getName() },
      uploaderEmail: { stringValue: email },
      createdAt: { timestampValue: new Date().toISOString() },
    },
  };
  const res = UrlFetchApp.fetch(
    "https://firestore.googleapis.com/v1/projects/" + FIREBASE_PROJECT_ID +
    "/databases/(default)/documents/certUploads?key=" + FIREBASE_API_KEY,
    { method: "post", contentType: "application/json", payload: JSON.stringify(body), muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) {
    throw new Error("Saved to Drive, but could not notify HIVE: " + res.getContentText().slice(0, 200));
  }
  return { url: url, fileName: file.getName() };
}

function getFolder() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function getSubfolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function authTest() {
  UrlFetchApp.fetch("https://www.google.com");
  DriveApp.getRootFolder();
  Logger.log("All permissions OK ✅");
}

/* ------------------------- upload page HTML ------------------------- */
const PAGE_HTML = `
<!DOCTYPE html><html><head><base target="_top"><style>
  body { font-family: "Segoe UI", Arial, sans-serif; background:#f7f7f5; margin:0;
         display:flex; align-items:center; justify-content:center; min-height:100vh; padding:16px; box-sizing:border-box; }
  .card { background:#fff; border-radius:14px; box-shadow:0 8px 30px rgba(0,0,0,.12);
          padding:26px; width:100%; max-width:460px; }
  h2 { margin:0 0 4px; } .muted { color:#6b6a66; font-size:13px; margin:0 0 14px; }
  label { display:block; font-size:13px; font-weight:600; margin:12px 0 4px; }
  input, select { width:100%; padding:9px 12px; border:1px solid #e5e4e0; border-radius:8px;
                  font:inherit; box-sizing:border-box; }
  .tabs { display:flex; gap:6px; margin-bottom:6px; }
  .tab { flex:1; text-align:center; padding:9px; border-radius:8px; border:1px solid #e5e4e0;
         cursor:pointer; font-weight:600; font-size:13px; }
  .tab.on { background:#f5a300; color:#1c1500; border-color:#f5a300; }
  button.up { margin-top:16px; width:100%; padding:11px; border:none; border-radius:8px;
           background:#f5a300; color:#1c1500; font-weight:700; font-size:15px; cursor:pointer; }
  button.up:disabled { opacity:.55; }
  .ok { background:#e2f5ea; color:#1a7f4b; padding:12px; border-radius:8px; margin-top:14px; display:none; font-size:14px; }
  .err { background:#fdecea; color:#c0392b; padding:12px; border-radius:8px; margin-top:14px; display:none; font-size:14px; }
  .previews { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
  .previews img { width:84px; height:84px; object-fit:cover; border-radius:8px; border:1px solid #e5e4e0; }
  .pdfchip { background:#f0efec; border-radius:8px; padding:8px 12px; font-size:12px; }
  .progress { margin-top:12px; display:none; }
  .bar { height:8px; background:#f0efec; border-radius:99px; overflow:hidden; }
  .bar > div { height:100%; width:0%; background:#f5a300; transition:width .3s; }
  .ptext { font-size:12px; color:#6b6a66; margin-top:5px; }
</style></head><body>
<div class="card">
  <h2>🐝 Upload to HIVE</h2>
  <p class="muted">For: <b><?= eventName ?></b></p>

  <div class="tabs">
    <div class="tab" id="tab-cert">📜 Certificate</div>
    <div class="tab" id="tab-photo">📸 Event photos</div>
  </div>

  <div id="zone-cert">
    <label>Certificate type</label>
    <select id="c-kind">
      <option value="participation">Participation</option>
      <option value="winner">Winner</option>
      <option value="other">Other</option>
    </select>
    <label>Label</label>
    <input type="text" id="c-label" placeholder="e.g. Winner certificate — finals" />
    <label>File (JPG / PNG / WEBP / PDF, max 10 MB)</label>
    <input type="file" id="c-file" accept=".jpg,.jpeg,.png,.webp,.pdf" />
  </div>

  <div id="zone-photo" style="display:none">
    <label>Photos of you participating (JPG / PNG / WEBP, max 10 MB each)</label>
    <input type="file" id="p-files" accept=".jpg,.jpeg,.png,.webp" multiple />
    <label>Caption <span style="font-weight:400;color:#6b6a66">(optional, applies to all)</span></label>
    <input type="text" id="p-label" placeholder="e.g. Receiving the award on stage" />
  </div>

  <div class="previews" id="previews"></div>

  <div class="progress" id="progress">
    <div class="bar"><div id="barfill"></div></div>
    <div class="ptext" id="ptext"></div>
  </div>

  <button class="up" id="btn">⬆ Upload</button>
  <div class="ok" id="ok"></div>
  <div class="err" id="err"></div>
</div>
<script>
  const PART_ID = "<?= partId ?>";
  const TOKEN = "<?= token ?>";
  let mode = "<?= mode ?>";

  const $ = (id) => document.getElementById(id);
  const tabs = { cert: $("tab-cert"), photo: $("tab-photo") };
  const zones = { cert: $("zone-cert"), photo: $("zone-photo") };

  function setMode(m) {
    mode = m;
    tabs.cert.classList.toggle("on", m === "cert");
    tabs.photo.classList.toggle("on", m === "photo");
    zones.cert.style.display = m === "cert" ? "" : "none";
    zones.photo.style.display = m === "photo" ? "" : "none";
    $("previews").innerHTML = "";
  }
  tabs.cert.onclick = () => setMode("cert");
  tabs.photo.onclick = () => setMode("photo");
  setMode(mode);

  // image previews before submission
  function preview(files) {
    const box = $("previews");
    box.innerHTML = "";
    [...files].forEach((f) => {
      if (f.type.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = URL.createObjectURL(f);
        box.appendChild(img);
      } else {
        const chip = document.createElement("div");
        chip.className = "pdfchip";
        chip.textContent = "📄 " + f.name;
        box.appendChild(chip);
      }
    });
  }
  $("c-file").addEventListener("change", (e) => preview(e.target.files));
  $("p-files").addEventListener("change", (e) => preview(e.target.files));

  function toBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  function runUpload(payload) {
    return new Promise((res, rej) => {
      google.script.run.withSuccessHandler(res).withFailureHandler(rej).uploadFile(payload);
    });
  }

  $("btn").addEventListener("click", async () => {
    const ok = $("ok"), err = $("err"), btn = $("btn"),
          prog = $("progress"), fill = $("barfill"), ptext = $("ptext");
    ok.style.display = err.style.display = "none";

    const files = mode === "cert" ? [...$("c-file").files] : [...$("p-files").files];
    if (!files.length) { err.textContent = "❌ Choose a file first."; err.style.display = "block"; return; }
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) { err.textContent = "❌ " + f.name + " is larger than 10 MB."; err.style.display = "block"; return; }
    }

    btn.disabled = true;
    prog.style.display = "block";
    let done = 0;
    try {
      for (const f of files) {
        ptext.textContent = "Uploading " + (done + 1) + " of " + files.length + " — " + f.name;
        fill.style.width = Math.round((done / files.length) * 100) + "%";
        const data = await toBase64(f);
        await runUpload({
          token: TOKEN, partId: PART_ID,
          kind: mode === "cert" ? $("c-kind").value : "photo",
          label: (mode === "cert" ? $("c-label").value : $("p-label").value).trim() || f.name,
          fileName: f.name, mimeType: f.type, data: data,
        });
        done++;
        fill.style.width = Math.round((done / files.length) * 100) + "%";
      }
      ptext.textContent = "Done!";
      ok.textContent = "✅ " + done + " file" + (done > 1 ? "s" : "") + " uploaded! Return to HIVE — " +
        (mode === "cert" ? "the certificate appears on the event page." : "the photos appear on the event page.") +
        " You can also upload more here.";
      ok.style.display = "block";
      $("c-file").value = ""; $("p-files").value = ""; $("previews").innerHTML = "";
    } catch (e2) {
      err.textContent = "❌ " + (e2.message || e2) + (done ? " (" + done + " uploaded before the error)" : "");
      err.style.display = "block";
    } finally {
      btn.disabled = false;
      setTimeout(() => { prog.style.display = "none"; fill.style.width = "0%"; }, 1500);
    }
  });
</script>
</body></html>`;
