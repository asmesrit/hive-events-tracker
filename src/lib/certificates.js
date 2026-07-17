// Certificates — Google Drive via a domain-restricted Apps Script page.
// Because the college Workspace only allows "Anyone within sritcbe.ac.in",
// HIVE cannot call the script in the background. Instead:
//   1. openCertUploader() opens the script's own upload page in a new tab
//      (student is signed in to their SRIT Google account, so it loads);
//   2. the script saves the file to Drive and writes the metadata to the
//      Firestore staging collection `certUploads`;
//   3. reconcileCertUploads() (run whenever a team member opens the event)
//      moves staged entries onto the participation doc and clears staging.
import {
  db, doc, updateDoc, deleteDoc, getDocs, collection, query, where,
  arrayUnion, arrayRemove, Timestamp,
} from "./firebase.js";
import { session } from "./auth.js";
import { CERT_UPLOAD_URL, CERT_UPLOAD_TOKEN } from "./firebase-config.js";

export const CERT_KINDS = ["participation", "winner", "other"];

export function certUploadsEnabled() { return !!CERT_UPLOAD_URL; }

/** Open the Apps Script upload page for this participation in a new tab.
 *  mode: "cert" (default) or "photo" — which tab the page opens on. */
export function openCertUploader(partId, eventName, mode = "cert") {
  const url = `${CERT_UPLOAD_URL}?token=${encodeURIComponent(CERT_UPLOAD_TOKEN)}` +
    `&partId=${encodeURIComponent(partId)}&event=${encodeURIComponent(eventName || "")}` +
    `&mode=${encodeURIComponent(mode)}`;
  window.open(url, "_blank", "noopener");
}

/** Drive image thumbnail (works for shared files). */
export function driveThumb(fileId, width = 400) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${width}`;
}

/** Pull staged uploads for this participation onto its `certificates` array.
 *  Returns the number of certificates attached. Caller must be a team
 *  member / creator / faculty (Firestore rules enforce it). */
export async function reconcileCertUploads(partId) {
  const qs = await getDocs(query(collection(db, "certUploads"), where("partId", "==", partId)));
  if (qs.empty) return 0;
  let n = 0;
  for (const d of qs.docs) {
    const s = d.data();
    const isPhoto = s.kind === "photo";
    const entry = {
      label: s.label || s.fileName || (isPhoto ? "Photo" : "Certificate"),
      kind: isPhoto ? "photo" : (CERT_KINDS.includes(s.kind) ? s.kind : "other"),
      url: s.url,
      fileId: s.fileId || "",
      fileName: s.fileName || "",
      uploadedBy: session.user.uid,
      uploadedByName: s.uploaderEmail || session.profile?.name || "",
      uploadedAt: s.createdAt || Timestamp.now(),
    };
    try {
      await updateDoc(doc(db, "participations", partId),
        isPhoto ? { photos: arrayUnion(entry) } : { certificates: arrayUnion(entry) });
      await deleteDoc(doc(db, "certUploads", d.id));
      n++;
    } catch (e) { console.warn("upload reconcile failed", e); }
  }
  return n;
}

/** Remove certificate metadata from the participation. The file itself
 *  stays in the college Drive (faculty can tidy the folder there). */
export async function deleteCertificate(partId, cert) {
  await updateDoc(doc(db, "participations", partId), { certificates: arrayRemove(cert) });
}

/** Remove a photo entry from the participation (Drive file stays). */
export async function deletePhoto(partId, photo) {
  await updateDoc(doc(db, "participations", partId), { photos: arrayRemove(photo) });
}
