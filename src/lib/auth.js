// Auth layer: registration, alias-aware login, session state,
// invite-code faculty signup, pending-participation claim on login.
import {
  auth, db,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider,
  doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp, arrayUnion, arrayRemove,
} from "./firebase.js";
import { ALLOWED_DOMAIN } from "./firebase-config.js";

/** In-memory session: { uid, email, profile } — profile is users/{uid} data */
export const session = { user: null, profile: null };

const authListeners = new Set();
export function onSessionChange(fn) { authListeners.add(fn); return () => authListeners.delete(fn); }
function notify() { authListeners.forEach((fn) => fn(session)); }

export function initAuth() {
  return new Promise((resolve) => {
    let first = true;
    onAuthStateChanged(auth, async (user) => {
      session.user = user;
      session.profile = null;
      if (user) {
        const snap = await getDoc(doc(db, "users", user.uid));
        session.profile = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        // reconcile participations that referenced this user's email before signup
        try { await claimPendingParticipations(user); } catch (e) { console.warn("claim failed", e); }
      }
      notify();
      if (first) { first = false; resolve(session); }
    });
  });
}

export function isSritEmail(email) {
  return typeof email === "string" && email.toLowerCase().endsWith("@" + ALLOWED_DOMAIN);
}

export function normEmail(email) { return (email || "").trim().toLowerCase(); }

/** Register a student or faculty account (in-app, fully automated).
 * profile: { name, year, department, registerNumber, skills[], extraFields{} }
 * role 'faculty' requires a valid unused inviteCode. */
export async function registerAccount({ email, password, role, inviteCode, profile }) {
  const emailLower = normEmail(email);
  if (!isSritEmail(emailLower)) {
    throw new Error(`Only @${ALLOWED_DOMAIN} email addresses can register.`);
  }
  // pre-check email index (Auth also enforces uniqueness of the auth email)
  const idxSnap = await getDoc(doc(db, "emailIndex", emailLower));
  if (idxSnap.exists()) throw new Error("This email is already registered (or used as an alias).");

  if (role === "faculty") {
    const codeSnap = await getDoc(doc(db, "inviteCodes", (inviteCode || "").trim()));
    if (!codeSnap.exists() || codeSnap.data().used) {
      throw new Error("Invalid or already-used faculty invite code.");
    }
  }

  const cred = await createUserWithEmailAndPassword(auth, emailLower, password);
  const uid = cred.user.uid;

  const userDoc = {
    role,
    // stored so security rules can validate the faculty invite code
    inviteCode: role === "faculty" ? inviteCode.trim() : null,
    authEmail: emailLower,
    aliasEmail: null,
    name: profile.name,
    year: profile.year || null,
    department: profile.department || null,
    registerNumber: profile.registerNumber || null,
    nameLower: (profile.name || "").toLowerCase(),
    skills: profile.skills || [],
    extraFields: profile.extraFields || {},
    createdAt: serverTimestamp(),
  };

  await setDoc(doc(db, "users", uid), userDoc);
  await setDoc(doc(db, "emailIndex", emailLower), { uid, authEmail: emailLower });

  if (role === "faculty") {
    await updateDoc(doc(db, "inviteCodes", inviteCode.trim()), {
      used: true, usedBy: uid, usedAt: serverTimestamp(),
    });
  }

  session.profile = { id: uid, ...userDoc };
  return uid;
}

/** Login with either the SRIT email or a personal alias — same password.
 * Resolves the typed email to the real auth email via emailIndex. */
export async function loginWithAnyEmail(typedEmail, password) {
  const emailLower = normEmail(typedEmail);
  let authEmail = emailLower;
  if (!isSritEmail(emailLower)) {
    const idx = await getDoc(doc(db, "emailIndex", emailLower));
    if (!idx.exists()) throw new Error("No account found for this email.");
    authEmail = idx.data().authEmail;
  }
  return signInWithEmailAndPassword(auth, authEmail, password);
}

export function logout() { return signOut(auth); }

/** Add or replace the personal alias email on the current account. */
export async function setAliasEmail(aliasEmail) {
  const uid = session.user.uid;
  const aliasLower = normEmail(aliasEmail);
  if (!aliasLower || !aliasLower.includes("@")) throw new Error("Enter a valid email.");
  if (isSritEmail(aliasLower)) throw new Error("Alias should be your personal (non-SRIT) email.");
  const existing = await getDoc(doc(db, "emailIndex", aliasLower));
  if (existing.exists() && existing.data().uid !== uid) {
    throw new Error("That email is already used by another account.");
  }
  const oldAlias = session.profile?.aliasEmail;
  await setDoc(doc(db, "emailIndex", aliasLower), { uid, authEmail: session.profile.authEmail });
  await updateDoc(doc(db, "users", uid), { aliasEmail: aliasLower });
  if (oldAlias && oldAlias !== aliasLower) {
    // best-effort cleanup of old alias index
    try { await deleteDoc(doc(db, "emailIndex", oldAlias)); } catch {}
  }
  session.profile.aliasEmail = aliasLower;
}

export async function changePassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}

/** On login/signup: attach any participations whose team listed this user's
 * SRIT email before they had an account. */
export async function claimPendingParticipations(user) {
  const emailLower = normEmail(user.email);
  const claimRef = doc(db, "pendingClaims", emailLower);
  const claimSnap = await getDoc(claimRef);
  if (!claimSnap.exists()) return 0;
  const partIds = claimSnap.data().partIds || [];
  let claimed = 0;
  for (const partId of partIds) {
    try {
      await runTransaction(db, async (tx) => {
        const pRef = doc(db, "participations", partId);
        const pSnap = await tx.get(pRef);
        if (!pSnap.exists()) return;
        const p = pSnap.data();
        const isMember = (p.pendingSritEmails || []).includes(emailLower);
        const isMentor = (p.mentorPendingEmails || []).includes(emailLower);
        const patch = {};
        if (isMember) {
          patch.members = (p.members || []).map((m) =>
            m.type === "srit-pending" && normEmail(m.email) === emailLower
              ? { ...m, type: "registered", uid: user.uid }
              : m
          );
          patch.memberUids = arrayUnion(user.uid);
          patch.pendingSritEmails = arrayRemove(emailLower);
        }
        if (isMentor) {
          patch.mentors = (p.mentors || []).map((m) =>
            m.type === "srit-pending" && normEmail(m.email) === emailLower
              ? { ...m, type: "registered", uid: user.uid }
              : m
          );
          patch.mentorUids = arrayUnion(user.uid);
          patch.mentorPendingEmails = arrayRemove(emailLower);
        }
        if (Object.keys(patch).length) tx.update(pRef, patch);
      });
      claimed++;
    } catch (e) { console.warn("claim tx failed for", partId, e); }
  }
  await deleteDoc(claimRef);
  return claimed;
}

export function isFaculty() { return session.profile?.role === "faculty"; }
export function requireAuth() { return !!session.user; }
