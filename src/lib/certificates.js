// Certificate uploads — files go to Google Drive via the Apps Script
// endpoint (docs/apps-script/certificate-store.gs); metadata lives on the
// participation doc in Firestore.
import { db, doc, updateDoc, arrayUnion, arrayRemove, Timestamp } from "./firebase.js";
import { session } from "./auth.js";
import { CERT_UPLOAD_URL, CERT_UPLOAD_TOKEN } from "./firebase-config.js";

export const CERT_KINDS = ["participation", "winner", "other"];
export const MAX_CERT_BYTES = 10 * 1024 * 1024; // keep in sync with the Apps Script
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function certUploadsEnabled() { return !!CERT_UPLOAD_URL; }

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]); // strip data: prefix
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function callEndpoint(payload) {
  // text/plain avoids a CORS preflight, which Apps Script cannot answer
  const res = await fetch(CERT_UPLOAD_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token: CERT_UPLOAD_TOKEN, ...payload }),
  });
  const out = await res.json();
  if (!out.ok) throw new Error(out.error || "Upload service error");
  return out;
}

/** Upload a certificate file and attach its metadata to the participation. */
export async function uploadCertificate(partId, file, { kind, label }) {
  if (!certUploadsEnabled()) throw new Error("Certificate uploads are not configured yet.");
  if (!ALLOWED_MIME.includes(file.type)) throw new Error("Only JPG, PNG, WEBP or PDF files are allowed.");
  if (file.size > MAX_CERT_BYTES) throw new Error("File is larger than 10 MB.");

  const data = await fileToBase64(file);
  const out = await callEndpoint({ partId, fileName: file.name, mimeType: file.type, data });

  const cert = {
    label: label || file.name,
    kind: kind || "participation",
    url: out.url,
    fileId: out.fileId,
    fileName: file.name,
    uploadedBy: session.user.uid,
    uploadedByName: session.profile?.name || "",
    uploadedAt: Timestamp.now(), // serverTimestamp() is not allowed inside arrayUnion
  };
  await updateDoc(doc(db, "participations", partId), { certificates: arrayUnion(cert) });
  return cert;
}

/** Remove a certificate: delete the Drive file, then drop the metadata. */
export async function deleteCertificate(partId, cert) {
  try { await callEndpoint({ action: "delete", fileId: cert.fileId }); }
  catch (e) { console.warn("Drive delete failed (removing metadata anyway)", e); }
  await updateDoc(doc(db, "participations", partId), { certificates: arrayRemove(cert) });
}
