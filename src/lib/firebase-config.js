// ============================================================
// HIVE Events Tracker — Firebase configuration
// ------------------------------------------------------------
// PASTE your Firebase web-app config below (Firebase Console →
// Project settings → General → Your apps → SDK setup & config).
// The web config is public-safe; security is enforced by
// Firestore security rules, not by hiding these values.
// ============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyAUBvsHEM3T3dCKVd_ggj46BYl-6ow6mjo",
  authDomain: "hive-events-tracker.firebaseapp.com",
  projectId: "hive-events-tracker",
  storageBucket: "hive-events-tracker.firebasestorage.app",
  messagingSenderId: "301921398525",
  appId: "1:301921398525:web:0566f59b37ebb2b3bd9894",
  measurementId: "G-KE3TG9B146"
};

// Set true to develop against the local Firebase Emulator Suite
// (firebase emulators:start). Set false for the real project.
export const USE_EMULATORS = false;

// App-wide constants
export const ALLOWED_DOMAIN = "sritcbe.ac.in";
export const DEFAULT_PASSWORD = "Hive@1234"; // students may keep or change it
export const APP_NAME = "HIVE Events Tracker";
