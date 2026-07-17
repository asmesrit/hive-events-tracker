/**
 * HIVE Events Tracker — Certificate uploader (Google Apps Script)
 * ----------------------------------------------------------------
 * Works with Workspace-restricted access ("Anyone within sritcbe.ac.in").
 * HIVE opens this web app in a new tab; the student (already signed in to
 * their SRIT Google account) uploads the certificate here. The file is
 * saved to this account's Drive and the metadata is written to a Firestore
 * staging collection (`certUploads`) that HIVE reconciles automatically.
 *
 * DEPLOY / UPDATE:
 *  1. Paste this ENTIRE file over the old code at script.google.com.
 *  2. Set SHARED_TOKEN to match CERT_UPLOAD_TOKEN in firebase-config.js.
 *  3. Deploy → Manage deployments → ✏ → Version: New version → Deploy.
 *     (Execute as: Me · Who has access: Anyone within sritcbe.ac.in)
 */

const SHARED_TOKEN = "asdfghjkl123456zxcvbnm456789"; // must match firebase-config.js
const FOLDER_NAME = "HIVE Certificates";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const FIREBASE_PROJECT_ID = "hive-events-tracker";
const FIREBASE_API_KEY = "AIzaSyAUBvsHEM3T3dCKVd_ggj46BYl-6ow6mjo"; // public web API key

/** Upload page. HIVE opens: <exec-url>?token=...&partId=...&event=... */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.token !== SHARED_TOKEN || !p.partId) {
    return HtmlService.createHtmlOutput(
      "<h3 style='font-family:sans-serif'>⛔ Invalid link</h3><p style='font-family:sans-serif'>Open this page from the HIVE app (Event → Upload certificate).</p>");
  }
  const t = HtmlService.createTemplate(PAGE_HTML);
  t.partId = p.partId;
  t.eventName = p.event || "your event";
  return t.evaluate()
    .setTitle("HIVE — Upload certificate")
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/** Called from the page via google.script.run with the whole <form>. */
function uploadCert(form) {
  const blob = form.file;
  if (!blob || !blob.getBytes) throw new Error("Please choose a file.");
  if (blob.getBytes().length > MAX_BYTES) throw new Error("File is larger than 10 MB.");
  const mime = blob.getContentType() || "";
  if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(mime)) {
    throw new Error("Only JPG, PNG, WEBP or PDF files are allowed.");
  }

  const email = Session.getActiveUser().getEmail() || "";
  const folder = getSubfolder(getFolder(), form.partId);
  const file = folder.createFile(blob);
  // best sharing we're allowed: try public link, fall back to domain link
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (err) {
    try { file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (err2) {}
  }

  const url = "https://drive.google.com/file/d/" + file.getId() + "/view";

  // stage metadata in Firestore for HIVE to pick up
  const body = {
    fields: {
      partId: { stringValue: String(form.partId) },
      kind: { stringValue: String(form.kind || "participation") },
      label: { stringValue: String(form.label || file.getName()) },
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

/* ------------------------- upload page HTML ------------------------- */
const PAGE_HTML = `
<!DOCTYPE html><html><head><base target="_top"><style>
  body { font-family: "Segoe UI", Arial, sans-serif; background:#f7f7f5; margin:0;
         display:flex; align-items:center; justify-content:center; min-height:100vh; }
  .card { background:#fff; border-radius:14px; box-shadow:0 8px 30px rgba(0,0,0,.12);
          padding:30px; width:100%; max-width:420px; }
  h2 { margin:0 0 4px; } .muted { color:#6b6a66; font-size:13px; margin:0 0 18px; }
  label { display:block; font-size:13px; font-weight:600; margin:12px 0 4px; }
  input, select { width:100%; padding:9px 12px; border:1px solid #e5e4e0; border-radius:8px;
                  font:inherit; box-sizing:border-box; }
  button { margin-top:18px; width:100%; padding:11px; border:none; border-radius:8px;
           background:#f5a300; color:#1c1500; font-weight:700; font-size:15px; cursor:pointer; }
  button:disabled { opacity:.55; }
  .ok { background:#e2f5ea; color:#1a7f4b; padding:12px; border-radius:8px; margin-top:16px; display:none; }
  .err { background:#fdecea; color:#c0392b; padding:12px; border-radius:8px; margin-top:16px; display:none; }
</style></head><body>
<div class="card">
  <h2>🐝 Upload certificate</h2>
  <p class="muted">For: <b><?= eventName ?></b></p>
  <form id="f">
    <input type="hidden" name="partId" value="<?= partId ?>" />
    <label>Certificate type</label>
    <select name="kind">
      <option value="participation">Participation</option>
      <option value="winner">Winner</option>
      <option value="other">Other</option>
    </select>
    <label>Label</label>
    <input type="text" name="label" placeholder="e.g. Winner certificate — finals" />
    <label>File (JPG / PNG / WEBP / PDF, max 10 MB)</label>
    <input type="file" name="file" accept=".jpg,.jpeg,.png,.webp,.pdf" required />
    <button type="submit" id="btn">⬆ Upload</button>
  </form>
  <div class="ok" id="ok">✅ Uploaded! You can upload another, or return to HIVE — the
    certificate appears on the event page (refresh it).</div>
  <div class="err" id="err"></div>
</div>
<script>
  const f = document.getElementById('f'), btn = document.getElementById('btn'),
        ok = document.getElementById('ok'), err = document.getElementById('err');
  f.addEventListener('submit', function(e) {
    e.preventDefault();
    ok.style.display = err.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Uploading…';
    google.script.run
      .withSuccessHandler(function(res) {
        ok.style.display = 'block';
        btn.disabled = false; btn.textContent = '⬆ Upload';
        f.file.value = ''; f.label.value = '';
      })
      .withFailureHandler(function(e2) {
        err.textContent = '❌ ' + (e2.message || e2);
        err.style.display = 'block';
        btn.disabled = false; btn.textContent = '⬆ Upload';
      })
      .uploadCert(f);
  });
</script>
</body></html>`;
