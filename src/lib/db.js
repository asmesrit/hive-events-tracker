// Data layer: participations, opportunities, users, invite codes.
import {
  db,
  doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  collection, query, where, orderBy, limit, startAt, endAt,
  serverTimestamp, arrayUnion, arrayRemove,
} from "./firebase.js";
import { session, normEmail } from "./auth.js";

export const EVENT_TYPES = [
  "Hackathon", "Workshop", "Paper Presentation", "Project Expo",
  "Coding Contest", "Ideathon", "Symposium", "Conference", "Sports", "Cultural", "Other",
];

export const DEPARTMENTS = [
  "CSE", "IT", "AI&DS", "ECE", "EEE", "MECH", "CIVIL", "CSBS", "MBA", "Other",
];

export const YEARS = ["I", "II", "III", "IV"];

function snapToObj(snap) { return { id: snap.id, ...snap.data() }; }
function snapsToArr(qs) { return qs.docs.map(snapToObj); }

/* ================= participations ================= */

/** Create a participation. members: [{type, uid?, name, email?}] */
export async function createParticipation(data) {
  const uid = session.user.uid;
  const memberUids = [uid, ...data.members.filter((m) => m.type === "registered" && m.uid).map((m) => m.uid)];
  const pendingSritEmails = data.members
    .filter((m) => m.type === "srit-pending" && m.email)
    .map((m) => normEmail(m.email));

  const docData = {
    eventName: data.eventName,
    eventNameLower: data.eventName.toLowerCase(),
    eventType: data.eventType,
    opportunityId: data.opportunityId || null,
    teamSize: Number(data.teamSize) || data.members.length + 1,
    members: data.members,
    memberUids: [...new Set(memberUids)],
    pendingSritEmails,
    currentStatus: data.currentStatus || "",
    overallStatus: data.overallStatus || "active",
    datesToTrack: data.datesToTrack || [],
    mentors: data.mentors || [], // [{ type:'registered'|'srit-pending', uid?, name, email? }]
    mentorUids: (data.mentors || []).filter((m) => m.type === "registered" && m.uid).map((m) => m.uid),
    mentorPendingEmails: (data.mentors || []).filter((m) => m.type === "srit-pending" && m.email).map((m) => normEmail(m.email)),
    prizeMoney: data.prizeMoney || null, // { amount, currency }
    photos: [], // filled via the Drive uploader (see lib/certificates.js)
    notes: data.notes || "",
    createdBy: uid,
    createdByName: session.profile?.name || "",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, "participations"), docData);
  await registerPendingClaims(ref.id, [...pendingSritEmails, ...docData.mentorPendingEmails]);
  return ref.id;
}

/** Mentors of a participation (handles legacy single-`mentor` docs). */
export function getMentors(p) {
  if (Array.isArray(p.mentors)) return p.mentors;
  return p.mentor ? [p.mentor] : [];
}

export async function updateParticipation(partId, data) {
  const patch = { ...data, updatedAt: serverTimestamp() };
  if (data.eventName) patch.eventNameLower = data.eventName.toLowerCase();
  if (data.members) {
    const current = await getParticipation(partId);
    const keepUids = data.members.filter((m) => m.type === "registered" && m.uid).map((m) => m.uid);
    patch.memberUids = [...new Set([current.createdBy, ...keepUids])];
    patch.pendingSritEmails = data.members
      .filter((m) => m.type === "srit-pending" && m.email)
      .map((m) => normEmail(m.email));
    await registerPendingClaims(partId, patch.pendingSritEmails);
  }
  if (data.mentors) {
    patch.mentorUids = data.mentors.filter((m) => m.type === "registered" && m.uid).map((m) => m.uid);
    patch.mentorPendingEmails = data.mentors
      .filter((m) => m.type === "srit-pending" && m.email)
      .map((m) => normEmail(m.email));
    patch.mentor = null; // clear legacy single-mentor field
    await registerPendingClaims(partId, patch.mentorPendingEmails);
  }
  await updateDoc(doc(db, "participations", partId), patch);
}

/** Participations mentored by a faculty uid. */
export async function participationsByMentor(uid) {
  const qs = await getDocs(query(
    collection(db, "participations"),
    where("mentorUids", "array-contains", uid),
    orderBy("createdAt", "desc"),
  ));
  return snapsToArr(qs);
}

export async function deleteParticipation(partId) {
  await deleteDoc(doc(db, "participations", partId));
}

export async function getParticipation(partId) {
  const snap = await getDoc(doc(db, "participations", partId));
  if (!snap.exists()) throw new Error("Participation not found");
  return snapToObj(snap);
}

/** Events the current user is part of (creator or teammate). */
export async function myParticipations() {
  const qs = await getDocs(query(
    collection(db, "participations"),
    where("memberUids", "array-contains", session.user.uid),
    orderBy("createdAt", "desc"),
  ));
  return snapsToArr(qs);
}

/** All participations (faculty). Optional filters applied client-side by callers. */
export async function allParticipations() {
  const qs = await getDocs(query(collection(db, "participations"), orderBy("createdAt", "desc")));
  return snapsToArr(qs);
}

export async function participationsByUser(uid) {
  const qs = await getDocs(query(
    collection(db, "participations"),
    where("memberUids", "array-contains", uid),
    orderBy("createdAt", "desc"),
  ));
  return snapsToArr(qs);
}

/** Prefix search on eventNameLower for the autocomplete. */
export async function searchParticipationNames(prefix, max = 8) {
  const p = prefix.toLowerCase();
  const qs = await getDocs(query(
    collection(db, "participations"),
    orderBy("eventNameLower"),
    startAt(p), endAt(p + ""),
    limit(max),
  ));
  // de-duplicate by name
  const seen = new Map();
  for (const d of snapsToArr(qs)) {
    if (!seen.has(d.eventNameLower)) seen.set(d.eventNameLower, d);
  }
  return [...seen.values()];
}

/** Track pendingClaims/{email} -> partIds so signup reconciliation is O(1). */
async function registerPendingClaims(partId, emails) {
  for (const email of emails) {
    await setDoc(doc(db, "pendingClaims", email), { partIds: arrayUnion(partId) }, { merge: true });
  }
}

/* ================= opportunities ================= */

export async function createOpportunity(data) {
  const docData = {
    name: data.name,
    nameLower: data.name.toLowerCase(),
    type: data.type || "Other",
    registrationLink: data.registrationLink || "",
    notes: data.notes || "",
    dates: data.dates || {},
    expiresOn: data.expiresOn || null, // yyyy-mm-dd; past = shown as expired, never auto-deleted
    isBroadcast: !!data.isBroadcast,
    postedBy: session.user.uid,
    postedByName: session.profile?.name || "",
    postedByRole: session.profile?.role || "student",
    createdAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, "opportunities"), docData);
  return ref.id;
}

export async function updateOpportunity(oppId, data) {
  const patch = { ...data };
  if (data.name) patch.nameLower = data.name.toLowerCase();
  await updateDoc(doc(db, "opportunities", oppId), patch);
}

export async function deleteOpportunity(oppId) {
  await deleteDoc(doc(db, "opportunities", oppId));
}

export async function listOpportunities() {
  const qs = await getDocs(query(collection(db, "opportunities"), orderBy("createdAt", "desc")));
  return snapsToArr(qs);
}

export async function getOpportunity(oppId) {
  const snap = await getDoc(doc(db, "opportunities", oppId));
  return snap.exists() ? snapToObj(snap) : null;
}

/** Prefix search on opportunity names for autocomplete. */
export async function searchOpportunities(prefix, max = 8) {
  const p = prefix.toLowerCase();
  const qs = await getDocs(query(
    collection(db, "opportunities"),
    orderBy("nameLower"),
    startAt(p), endAt(p + ""),
    limit(max),
  ));
  return snapsToArr(qs);
}

/* ================= users ================= */

export async function getUser(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snapToObj(snap) : null;
}

export async function updateUser(uid, patch) {
  if (patch.name) patch.nameLower = patch.name.toLowerCase();
  await updateDoc(doc(db, "users", uid), patch);
}

export async function deleteUser(uid) {
  await deleteDoc(doc(db, "users", uid));
}

/** Search registered users by name prefix (for teammate picker & master search). */
export async function searchUsersByName(prefix, max = 8) {
  const p = prefix.toLowerCase();
  const qs = await getDocs(query(
    collection(db, "users"),
    orderBy("nameLower"),
    startAt(p), endAt(p + ""),
    limit(max),
  ));
  return snapsToArr(qs);
}

/** Search registered faculty by name prefix (faculty-only query so results
 *  aren't crowded out by students — uses the role+nameLower index). */
export async function searchFacultyByName(prefix, max = 8) {
  const p = prefix.toLowerCase();
  const qs = await getDocs(query(
    collection(db, "users"),
    where("role", "==", "faculty"),
    orderBy("nameLower"),
    startAt(p), endAt(p + ""),
    limit(max),
  ));
  return snapsToArr(qs);
}

export async function findUserByEmail(email) {
  const idx = await getDoc(doc(db, "emailIndex", normEmail(email)));
  if (!idx.exists()) return null;
  return getUser(idx.data().uid);
}

export async function allStudents() {
  const qs = await getDocs(query(collection(db, "users"), where("role", "==", "student"), orderBy("nameLower")));
  return snapsToArr(qs);
}

export async function allUsers() {
  const qs = await getDocs(query(collection(db, "users"), orderBy("nameLower")));
  return snapsToArr(qs);
}

/* ================= invite codes (faculty can mint more) ================= */

export async function createInviteCode(code) {
  await setDoc(doc(db, "inviteCodes", code), {
    role: "faculty", used: false, createdBy: session.user.uid, createdAt: serverTimestamp(),
  });
}

export async function listInviteCodes() {
  const qs = await getDocs(collection(db, "inviteCodes"));
  return snapsToArr(qs);
}
