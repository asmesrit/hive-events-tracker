/**
 * HIVE Events Tracker — Certificate storage endpoint (Google Apps Script)
 * ----------------------------------------------------------------------
 * Receives certificate uploads from the HIVE web app and stores them in
 * a Google Drive folder owned by this Google account. Returns a shareable
 * view link that HIVE saves in Firestore.
 *
 * DEPLOY (one time, ~5 minutes):
 *  1. Sign in to the Google account that should own the certificate files
 *     (e.g. the department account).
 *  2. Open https://script.google.com → New project.
 *  3. Delete the sample code, paste this ENTIRE file, and save (name it
 *     "HIVE Certificate Store").
 *  4. Change SHARED_TOKEN below to your own random secret.
 *  5. Click Deploy → New deployment → type: Web app.
 *       - Execute as: Me
 *       - Who has access: Anyone
 *     Click Deploy, authorize the permissions, and COPY the web app URL
 *     (ends in /exec).
 *  6. Paste that URL and the same token into src/lib/firebase-config.js
 *     (CERT_UPLOAD_URL and CERT_UPLOAD_TOKEN), then redeploy HIVE.
 */

const SHARED_TOKEN = "CHANGE-ME-TO-A-RANDOM-SECRET";  // must match firebase-config.js
const FOLDER_NAME = "HIVE Certificates";
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);

    if (req.token !== SHARED_TOKEN) {
      return respond({ ok: false, error: "Unauthorized" });
    }

    // ---- delete a previously uploaded certificate ----
    if (req.action === "delete") {
      if (!req.fileId) return respond({ ok: false, error: "fileId required" });
      DriveApp.getFileById(req.fileId).setTrashed(true);
      return respond({ ok: true });
    }

    // ---- upload ----
    if (!req.fileName || !req.mimeType || !req.data) {
      return respond({ ok: false, error: "fileName, mimeType and data are required" });
    }
    const bytes = Utilities.base64Decode(req.data);
    if (bytes.length > MAX_BYTES) {
      return respond({ ok: false, error: "File exceeds 10 MB limit" });
    }

    const folder = getFolder();
    // group files per event inside subfolders when partId is sent
    const target = req.partId ? getSubfolder(folder, req.partId) : folder;
    const blob = Utilities.newBlob(bytes, req.mimeType, req.fileName);
    const file = target.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return respond({
      ok: true,
      fileId: file.getId(),
      url: "https://drive.google.com/file/d/" + file.getId() + "/view",
    });
  } catch (err) {
    return respond({ ok: false, error: String(err) });
  }
}

// Health check: open the /exec URL in a browser to confirm deployment.
function doGet() {
  return respond({ ok: true, service: "HIVE Certificate Store" });
}

function getFolder() {
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
}

function getSubfolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function respond(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
