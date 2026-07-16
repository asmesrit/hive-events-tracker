# 🐝 HIVE Events Tracker

A portal for SRIT students to track every hackathon and event they participate in — with team sharing, live status, dashboards, and a full admin console for faculty.

**Stack:** Plain HTML/JS (no build step) · Firebase Auth · Firestore · Chart.js · jsPDF

## Features

**Students**
- Register with `@sritcbe.ac.in` email only (optional default password)
- Link a personal email as an alias and sign in with either — same password
- Track participations: event name, type, team, dates, progress, overall status (active/won/lost)
- Add teammates: registered HIVE users (event appears in their list instantly), unregistered SRIT students by college email (auto-attached when they sign up), or external students
- Event-name autocomplete links entries to the same event so faculty can filter participants
- Personal analytics dashboard + upcoming-dates reminders
- Post opportunities (name, registration link, notes) for everyone to see

**Faculty / Admin**
- Register with a one-time invite code
- College-wide visual analytics; most-active students
- Master student search → full profile + participation history
- All-events view with filters (event, status, type, department, period)
- In-app CRUD on students and event entries
- Report builder with **CSV** and **PDF** export
- Broadcast opportunities to all students ("Track this event" one-click)
- Mint new faculty invite codes

## Setup (one time)

### 1. Firebase console
1. Create a project at [console.firebase.google.com](https://console.firebase.google.com) (this repo assumes id `hive-events-tracker` — see `.firebaserc`).
2. **Build → Authentication → Sign-in method** → enable **Email/Password**.
3. **Build → Firestore Database** → Create database (production mode, `asia-south1` recommended).
4. **Project settings → General → Your apps** → add a **Web app** → copy the `firebaseConfig` into [src/lib/firebase-config.js](src/lib/firebase-config.js).

### 2. Deploy rules & indexes
```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore
```

### 3. Seed the first faculty invite code
The first faculty account needs a code that no faculty exists yet to create, so add it once by hand:
Firestore console → Start collection `inviteCodes` → Document ID: `HIVE-FACULTY-2026` → fields:
- `role` (string): `faculty`
- `used` (boolean): `false`

After that, faculty can mint further codes from **Admin → Reports**.

### 4. Run locally
ES modules need an HTTP server (opening `index.html` directly won't work):
```bash
npx serve .          # or: python -m http.server 5000
```
Or with the Firebase emulators (set `USE_EMULATORS = true` in `firebase-config.js`):
```bash
firebase emulators:start
```

### 5. Deploy
```bash
firebase deploy
```

## Project structure
```
index.html                  entry point (CDN: Chart.js, jsPDF)
firestore.rules             security rules
firestore.indexes.json      composite indexes
src/
  main.js                   hash router + app shell
  styles.css                all styling
  lib/
    firebase-config.js      ← paste your firebaseConfig here
    firebase.js             SDK init + re-exports
    auth.js                 registration, alias login, claim reconciliation
    db.js                   all Firestore reads/writes
    ui.js                   toasts, modals, formatting helpers
  pages/                    one module per route
```

## Data model (Firestore)
| Collection | Purpose |
|---|---|
| `users/{uid}` | profile: role, name, year, dept, regNo, skills, alias |
| `emailIndex/{email}` | any login email → real auth email (alias login) |
| `participations/{id}` | one team's tracked event; `memberUids` powers sharing |
| `pendingClaims/{email}` | events waiting for an unregistered SRIT teammate |
| `opportunities/{id}` | posted events / broadcasts; powers autocomplete |
| `inviteCodes/{code}` | one-time faculty registration codes |
