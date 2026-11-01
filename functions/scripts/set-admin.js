// Run from the functions directory after authenticating with Application Default Credentials:
// GOOGLE_APPLICATION_CREDENTIALS="/secure/path/service-account.json" node scripts/set-admin.js FIREBASE_AUTH_UID
// Keep the service-account JSON outside the project and never commit it.
const admin = require("firebase-admin");
const uid = process.argv[2];
if (!uid) {
  console.error("Usage: node scripts/set-admin.js FIREBASE_AUTH_UID");
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.applicationDefault() });
admin.auth().setCustomUserClaims(uid, { admin: true })
  .then(() => { console.log(`Admin claim assigned to ${uid}. Ask the user to sign out and sign in again.`); process.exit(0); })
  .catch(error => { console.error(error); process.exit(1); });
