# 🐝 HIVE Events Tracker — Developer Documentation

A portal for SRIT (Sri Ramakrishna Institute of Technology) students to track hackathon/event participation — team sharing, certificates & photos on Google Drive, dashboards, mentoring views, and a full admin console for faculty.

- **Live app:** https://srit-hive.web.app
- **User guide:** [docs/HIVE-User-Guide-v2.pdf](docs/HIVE-User-Guide-v2.pdf)
- **Stack:** Vanilla JS (ES modules, no build step) · Firebase Auth · Firestore · Firebase Hosting · Google Apps Script (Drive uploads) · Chart.js · jsPDF

---

## 1. Architecture overview

```
┌──────────────────────── Browser (srit-hive.web.app) ────────────────────────┐
│  index.html  →  src/main.js (hash router + shell)  →  src/pages/*.js        │
│                          │                                                  │
│                 src/lib/ (auth, db, ui, certificates, report, reminders)    │
└───────┬──────────────────────┬──────────────────────────────┬───────────────┘
        │ Firebase Auth        │ Firestore (data)             │ new tab
        ▼                      ▼                              ▼
  email/password        collections (see §3)         Google Apps Script page
  one account,          security rules enforce       (domain-restricted) saves
  two login emails      all access control           files → Drive, metadata →
                                                     Firestore `certUploads`
```

**No build step.** The app is plain ES modules served statically. Firebase SDK v10, Chart.js and jsPDF load from CDNs (pinned versions in [index.html](index.html) and [src/lib/firebase.js](src/lib/firebase.js)). There is no server: all logic runs client-side, and **Firestore security rules are the only real access control** — never trust the client.

### Module map

| File | Responsibility |
|---|---|
| `src/main.js` | Hash router (`#/route`), auth guard, sidebar shell, deadline-reminder trigger |
| `src/lib/firebase-config.js` | **All environment config**: Firebase web config, emulator flag, allowed email domain, default password, Apps Script URL + token |
| `src/lib/firebase.js` | SDK init + re-exports every Firebase function used (single place to bump SDK version) |
| `src/lib/auth.js` | Registration (domain check, invite codes), alias login, session state, pending-claim reconciliation on login |
| `src/lib/db.js` | Every Firestore read/write; collection constants (`EVENT_TYPES`, `DEPARTMENTS`, `YEARS`) |
| `src/lib/certificates.js` | Drive upload flow: opens uploader tab, reconciles `certUploads` staging into events |
| `src/lib/report.js` | Per-student PDF/CSV generation (jsPDF + autotable) |
| `src/lib/reminders.js` | Once-a-day deadline popup for expiring opportunities |
| `src/lib/ui.js` | Toasts, modals, escaping, date formatting, badges, debounce |
| `src/pages/*.js` | One module per route; each exports `render<Name>(el, params)` |
| `docs/apps-script/certificate-store.gs` | The Google Apps Script web app (see §5) |

### Routing

`src/main.js` holds a regex route table. Auth levels: `public` (login/register), `any` (signed in), `faculty` (checks `session.profile.role`). Pages render into `#outlet` inside the sidebar shell. Add a route = add the regex + import + a `navItem()` in the shell.

---

## 2. Authentication

- **Firebase Auth email/password**, one account per person. Registration is **fully self-service in-app** — never create users manually.
- **Domain lock:** only `@sritcbe.ac.in` may register (checked client-side in `auth.js`; the real gate is that `emailIndex`/`users` writes are rule-validated).
- **Faculty role:** chosen at signup with a one-time **invite code**. The security rules validate the code exists and is unused (`validInviteCode()` in [firestore.rules](firestore.rules)) — the code is stored on the user doc (`inviteCode` field) precisely so rules can `get()` it. First code must be seeded manually in the console (collection `inviteCodes`, doc ID = the code, fields `role: "faculty"`, `used: false`); after that, faculty mint codes in-app.
- **Alias login (two emails, one password):** Firebase Auth knows only the college email. `emailIndex/{emailLower}` maps *any* login email → the real auth email. `loginWithAnyEmail()` resolves the typed email through that index, then calls `signInWithEmailAndPassword` with the real one. Adding an alias just writes another index doc — no Auth change.
- **Claim-on-signup:** if someone was named (as teammate `srit-pending` or mentor) by email before registering, `claimPendingParticipations()` runs at login: it reads `pendingClaims/{email}`, and for each participation transactionally upgrades their member/mentor entry to `registered`, adds their uid to `memberUids`/`mentorUids`, and clears the pending email.

---

## 3. Firestore data model

| Collection | Doc ID | Purpose |
|---|---|---|
| `users/{uid}` | Auth uid | Profile: `role`, `name`, `nameLower`, `year`, `department`, `registerNumber`, `skills[]`, `extraFields{}`, `authEmail`, `aliasEmail`, `inviteCode` (faculty) |
| `emailIndex/{email}` | lowercased email | `{ uid, authEmail }` — alias-login translation + email uniqueness. Public **get** (needed pre-auth), no list |
| `participations/{id}` | auto | One team's tracked event (see below) |
| `opportunities/{id}` | auto | Posted events / broadcasts: `name`, `nameLower`, `type`, `registrationLink`, `notes`, `expiresOn` (yyyy-mm-dd or null), `isBroadcast`, `postedBy*` |
| `pendingClaims/{email}` | lowercased email | `{ partIds: [...] }` — O(1) signup reconciliation index |
| `certUploads/{id}` | auto | **Staging** for Drive uploads (written unauthenticated by Apps Script; consumed & deleted by the app) |
| `inviteCodes/{code}` | the code itself | `{ role: 'faculty', used, usedBy?, createdBy? }` |

### `participations` document

```js
{
  eventName, eventNameLower,      // *Lower fields power prefix search (orderBy+startAt/endAt)
  eventType,                      // from EVENT_TYPES or free text via "Other"
  opportunityId,                  // link to opportunities/{id} when tracked from a post (or null)
  teamSize,
  members: [{ type: 'registered'|'srit-pending'|'external', uid?, name, email?, role? }],
  memberUids: [uid, ...],         // DENORMALIZED: creator + registered members — powers
                                  //   "my events" (array-contains) and edit permission
  pendingSritEmails: [email],     // srit-pending member emails awaiting signup
  mentors: [{ type: 'registered'|'srit-pending', uid?, name, email? }],
  mentorUids: [uid, ...],         // DENORMALIZED — powers "My Mentoring" query
  mentorPendingEmails: [email],
  currentStatus,                  // free-text progress
  overallStatus,                  // 'active' | 'won' | 'lost'
  datesToTrack: [{ label, date }],// date = 'yyyy-mm-dd' string (string compare works)
  prizeMoney: { amount, currency } | null,
  certificates: [{ label, kind: 'participation'|'winner'|'other', url, fileId, fileName,
                   uploadedBy, uploadedByName, uploadedAt }],
  photos: [ same shape, kind: 'photo' ],
  createdBy, createdByName, createdAt, updatedAt,
  mentor: null,                   // LEGACY single-mentor field; getMentors() handles both
}
```

**Denormalization rules of thumb used everywhere:**
- Arrays of uids (`memberUids`, `mentorUids`) exist because Firestore can only query membership via `array-contains` — keep them in sync in `createParticipation`/`updateParticipation`.
- `*Lower` name fields exist because Firestore has no case-insensitive search; prefix search = `orderBy(field), startAt(p), endAt(p + '')`.
- Timestamps inside array elements use `Timestamp.now()` — `serverTimestamp()` is not allowed inside `arrayUnion`.

### Composite indexes ([firestore.indexes.json](firestore.indexes.json))

| Collection | Fields | Serves |
|---|---|---|
| participations | `memberUids` (contains) + `createdAt` desc | My Events / per-student history |
| participations | `mentorUids` (contains) + `createdAt` desc | My Mentoring |
| users | `role` asc + `nameLower` asc | student list, faculty-only mentor search |

Single-field indexes (automatic) cover the rest. New composite queries will throw an error with a console link — add the index to the JSON and `firebase deploy --only firestore`.

---

## 4. Security rules ([firestore.rules](firestore.rules))

The rules are the actual security boundary. Key decisions:

- `users`: readable by any signed-in user (needed for teammate/mentor search). Self-create with role validation (faculty requires valid unused invite code via rule-side `get()`); self-update cannot change `role`; faculty can update/delete anyone.
- `participations`: **readable by all signed-in users** — deliberate, because the event-name autocomplete must prefix-scan the collection and faculty need global filtering. Updates: team members, creator, faculty, **or** a user whose auth email is in `pendingSritEmails`/`mentorPendingEmails` (that's what lets claim-on-signup work). Deletes: creator or faculty.
- `certUploads`: `create` is **open but shape-validated** (key whitelist, `url` must match `https://drive.google.com/...`) because Apps Script writes via REST with only the API key (no auth). Read/delete require sign-in. Worst-case abuse is junk staging docs that never attach to anything.
- `emailIndex`: public `get` (pre-auth alias resolution), no `list`, writes only for your own uid.
- `inviteCodes`: public `get` by exact ID (registration validates a typed code before sign-in) but `list` is faculty-only, so codes can't be enumerated.

After editing: `firebase deploy --only firestore:rules`.

---

## 5. Certificates & photos — the Drive pipeline

**Constraint that shaped the design:** the college Workspace only allows Apps Script web apps to be shared "Anyone within sritcbe.ac.in". A domain-gated script **cannot be called by `fetch()` from another origin** (Google answers with a login redirect, and browsers won't attach Google cookies to cross-site requests). So background uploads from the app are impossible.

**The flow that works:**

1. HIVE opens the Apps Script page in a **new tab** (`openCertUploader(partId, eventName, mode)`) with the shared token, partId and mode (`cert`/`photo`) in the query string. The student is signed into their SRIT Google account, so the page loads.
2. The page ([certificate-store.gs](docs/apps-script/certificate-store.gs)) shows a tabbed uploader — certificate (single file + kind + label) or photos (multi-select, image previews, per-file progress). Files are base64'd client-side and passed to the server function `uploadFile()` via `google.script.run`.
3. The script (running as the deploying account) saves each file into Drive under `HIVE Certificates/<partId>/`, sets link-sharing (tries `ANYONE_WITH_LINK`, falls back to `DOMAIN_WITH_LINK` if Workspace policy blocks public links), then writes the metadata to Firestore's `certUploads` collection **via REST + API key** (unauthenticated — allowed by the shape-validated create rule).
4. Back in HIVE, `reconcileCertUploads(partId)` runs whenever a team member opens the event page (and on the 🔄 button): it queries `certUploads` by partId, `arrayUnion`s each entry into `certificates` or `photos` on the participation, and deletes the staging doc.

**Deleting** a certificate/photo in HIVE removes only the metadata; the Drive file stays (the app has no authenticated channel to delete Drive files — by design trade-off).

**Updating the script:** paste the new .gs over the old at script.google.com, then **Deploy → Manage deployments → ✏ → New version → Deploy** (URL stays the same). If a *new* deployment is created instead, the URL changes and `CERT_UPLOAD_URL` in `firebase-config.js` must be updated + redeployed. New permission scopes require running any function once from the editor to trigger the authorization prompt (`authTest()` exists for this).

**Shared secret:** `SHARED_TOKEN` in the script must equal `CERT_UPLOAD_TOKEN` in `firebase-config.js`. It gates the page and the server function.

---

## 6. Hosting & deployment

- **Firebase Hosting**, multi-site: this app deploys to the site **`srit-hive`** (`"site"` key in [firebase.json](firebase.json)) inside project **`hive-events-tracker`**. `public: "."` — the repo root is served; `ignore` excludes config/docs.
- **SPA rewrite:** all paths → `/index.html` (routing is client-side via `#` hashes anyway).
- **Cache policy:** JS/CSS/HTML are served `Cache-Control: no-cache` so every deploy is visible on next reload (browsers revalidate; unchanged files still come from cache via ETag). Don't "optimize" this back to long max-age without adding content-hashed filenames — there is no bundler to do that hashing.

```bash
# one-time setup
npm install -g firebase-tools
firebase login

# deploy code changes
firebase deploy --only hosting

# deploy rules and/or indexes
firebase deploy --only firestore

# everything
firebase deploy
```

### Local development

```bash
npx serve .            # any static server works; file:// does NOT (ES modules)
```
Against production Firestore by default. For a sandbox, set `USE_EMULATORS = true` in `firebase-config.js` and run `firebase emulators:start` (Auth 9099, Firestore 8080 — see firebase.json).

### Config knobs (all in [src/lib/firebase-config.js](src/lib/firebase-config.js))

| Constant | Meaning |
|---|---|
| `firebaseConfig` | Firebase web app config (public-safe; rules are the security) |
| `USE_EMULATORS` | Point Auth/Firestore at the local emulator suite |
| `ALLOWED_DOMAIN` | Email domain allowed to register (`sritcbe.ac.in`) |
| `DEFAULT_PASSWORD` | Prefilled by the "use default password" toggle at signup |
| `CERT_UPLOAD_URL` | Apps Script `/exec` URL (empty string hides all upload UI) |
| `CERT_UPLOAD_TOKEN` | Shared secret; must match the script's `SHARED_TOKEN` |
| `APP_NAME` | Used in titles and PDF headers |

---

## 7. Conventions & gotchas

- **Rendering:** pages build HTML strings and set `innerHTML`, then wire handlers with `querySelector`. **Always pipe user data through `escapeHtml()`** — it's the only XSS defense.
- **Dates:** `datesToTrack[].date` and `expiresOn` are `yyyy-mm-dd` strings compared lexically; `createdAt`/`updatedAt` are Firestore Timestamps (`toJsDate()` in ui.js normalizes both).
- **Legacy fields:** old docs may have single `mentor` instead of `mentors[]` — always read mentors through `getMentors(p)` (db.js). Docs created before a field existed simply lack it — write code as `(p.photos || [])`.
- **`` sentinel** in prefix searches is an invisible character — it's there even if your editor/grep doesn't show it. Don't retype those lines carelessly.
- **jsPDF/Chart.js are globals** (`window.jspdf`, `window.Chart`) from UMD CDN builds — not imports.
- **PowerShell note (Windows dev):** repo files are UTF-8; some PS 5.1 cmdlets misread them — prefer git-bash for byte-level checks.
- **Firestore limits to respect:** 1 MB/doc (why files live in Drive, and why unbounded arrays like `certificates` are fine only because certificates per event are naturally few), no `serverTimestamp()` in `arrayUnion`, queries need every possibly-matching doc readable under rules.
- **Reminder popup** state is `localStorage["hive.deadlineReminderShown"] = yyyy-mm-dd` — once per browser per day.
- **"Track this event"** passes the opportunity via `sessionStorage["hive.trackOpportunity"]` to the event form.

## 8. Operational runbook

| Task | How |
|---|---|
| Reset a student's password | Firebase console → Authentication → user → Reset password (no in-app flow) |
| Fully delete a user | Delete in Authentication **and** their `users/{uid}` doc (+ `emailIndex` docs) |
| Seed/replace faculty invite code | Firestore console → `inviteCodes` (or in-app: Admin → Reports) |
| Rotate the upload token | Change `SHARED_TOKEN` in the script → New version deploy → change `CERT_UPLOAD_TOKEN` → `firebase deploy --only hosting` |
| Change allowed email domain | `ALLOWED_DOMAIN` in firebase-config.js (note: srit-pending teammate/mentor validation uses it too) |
| Tidy Drive storage | Files live in `HIVE Certificates/<partId>/` in the deploying Google account's Drive |
| Regenerate the user guide PDF | Edit `docs/user-guide-v2.html` → print to PDF (headless Edge/Chrome or browser print) |
