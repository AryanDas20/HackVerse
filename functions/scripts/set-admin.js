#!/usr/bin/env node
const { initializeApp, getApps, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const uid = process.argv[2];
if (!uid) {
  console.error("Usage: node scripts/set-admin.js FIREBASE_AUTH_UID");
  process.exit(1);
}
if (!getApps().length) initializeApp({ credential: applicationDefault() });
getAuth().setCustomUserClaims(uid, { admin: true })
  .then(() => { console.log(`Admin claim assigned to ${uid}. Ask the user to sign out and sign in again.`); process.exit(0); })
  .catch(error => { console.error(error); process.exit(1); });
