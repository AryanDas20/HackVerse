# v5.2.0 release checks

## Automated checks performed
- `node --check public/app.js` — passed.
- `node --check functions/index.js` — passed.
- `node --check functions/scripts/run-discovery.js` — passed.
- New UI element IDs were checked for presence in both HTML and app event bindings.
- Firestore conversation update rules were inspected for the creator-only soft-delete branch.
- ZIP integrity will be checked after packaging.

## Not verified in this environment
- Live Firebase Authentication sign-up/sign-in.
- Firestore reads/writes against the user's project.
- Firestore rules deployment/compilation in Firebase Console.
- Vercel deployment and browser testing on physical mobile devices.
- Invitee-side group consent workflow and notification centre (not implemented in this release).

## Important
The Firebase web configuration is populated with the project values supplied by the user. Authentication providers, Firestore database, authorized domains, deployed rules, and Vercel hosting still need to be checked in the Firebase/Vercel consoles.
