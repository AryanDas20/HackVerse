# HackVerse AI + Agent37 setup

This release adds an Agent37-backed assistant to the HackVerse website. It has two modes:

- **Website help:** answers questions about the existing HackVerse pages and workflows.
- **AI Wish:** translates a request into a list of supported website actions. The member reviews the list and explicitly approves it before the browser applies the actions.

It also adds private conversation history and protects opportunity/event listings behind Firebase sign-in.

## 1. Create or open your personal Agent37 agent

1. Open **https://agent37.com/personal**. Use the personal page, as described in the Build 2026 announcement. Do not use the Cloud Sandbox page to create a different agent.
2. Select **Start free** and sign up. Do not enter a debit/credit card. Stop if a page asks for card details; return to the personal page or contact Agent37/Hackyard support.
3. Open the personal agent you created.
4. In the Agent37 dashboard, use **Copy instance ID** beside the agent name. Keep the copied value for the Vercel configuration below.
5. Do not share your sign-in password, API key, or any other private credential with the website's frontend.

### Important: instance ID versus API authentication

The instance ID identifies the agent, but it is not an authentication credential. You also need the Agent37 workspace API key (typically beginning `sk_live_`) from the Agent37 dashboard. The server-side connector calls `POST https://{instanceId}.agent37.app/v1/responses`, sends that key in `X-Agent37-Key`, and saves the returned `session_id` so the user's next turn continues the same Agent37 session. That request shape and header are documented in Agent37's [Send a message API guide](https://www.agent37.com/docs/agents-api/chat) and its [instance URL guide](https://www.agent37.com/docs/agents-api/urls).

For the managed `agent37-hermes` template, Agent37 exposes the agent gateway on the bare instance URL. You do not need to configure a second `API_SERVER_KEY` inside Hermes for this managed gateway. The model provider/credit is separate from the workspace API key: the personal Free plan page currently lists a small starter model credit followed by bring-your-own-provider-key (BYOK).

**Important card warning:** your Hackyard Build 2026 announcement says the challenge sign-up must not ask for a card. Follow that challenge instruction exactly: do not enter a card. Agent37's general public personal-plan page currently contains different card-on-file wording for its Free plan. If the page shown to you asks for card details, stop there and ask Hackyard/Agent37 support to confirm the challenge-specific flow; do not bypass the challenge warning.

If your dashboard does not expose a supported workspace API key for this personal agent, ask Agent37/Hackyard support whether the Build 2026 tier provides one. **Do not visit Cloud Sandbox to create a paid sandbox, do not add a card, and do not invent a key.** The website code cannot authenticate using an instance ID alone.

### Submit the Build 2026 entry

After the agent is running, open **https://hackyard.org/build2026/agent37** and submit the fields requested in the challenge announcement: Build 2026 application email, project link, Agent37 email, instance ID and a dashboard screenshot. Use your deployed HackVerse URL as the project link. The screenshot should prove the agent exists, but crop/blur any API key, token, email inbox contents or other secret information. The submission form does not need your API key.

## 2. Deploy HackVerse on Vercel

The new `/api/agent37/chat` endpoint is a Vercel serverless function. Deploying only the static files to Firebase Hosting will not deploy this endpoint.

1. Keep the project root as the Vercel **Root Directory** (the folder containing `package.json`, `vercel.json`, `api/`, and `public/`).
2. Set **Framework Preset** to Other.
3. Set **Output Directory** to `public` (or let `vercel.json` supply it).
4. Use Node.js 22 for the function runtime.
5. Install dependencies from the root `package.json`; Vercel does this during deployment.
6. Deploy the project to Vercel. The browser calls the same-origin routes `/api/agent37/chat` and `/api/chat-media`.

If the live site is currently served only by Firebase Hosting, move the frontend hosting to Vercel or deploy an equivalent secure server-side API and update the frontend endpoint. Do not call Agent37 directly from browser code.

## 3. Add server-only environment variables in Vercel

Open **Vercel → your HackVerse project → Settings → Environment Variables**. Add these variables for **Production**, and also for Preview if you test preview deployments:

| Variable | Value |
|---|---|
| `AGENT37_INSTANCE_ID` | The exact value copied from **Copy instance ID** |
| `AGENT37_API_KEY` | Your Agent37 workspace API key (`sk_live_...`) used in the `X-Agent37-Key` header; server-only |
| `AGENT37_REASONING_EFFORT` | Optional; defaults to `ultra`, Agent37’s strongest reasoning/orchestration setting. Set to `high` or `medium` to reduce usage/latency |
| `FIREBASE_PROJECT_ID` | `hackverseneo` (or your actual Firebase project ID if different) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | The complete JSON for a service account belonging to the same Firebase project |
| `SUPABASE_URL` | Supabase Project URL (same value as `public/supabase-config.js`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role secret; server-only |
| `SUPABASE_STORAGE_BUCKET` | `chat-media` |

Optional, only if Agent37 support tells you to use a different agent/profile:

| Variable | Value |
|---|---|
| `AGENT37_INSTANCE_URL` | The HTTPS URL of your Agent37 instance, for example `https://YOUR_INSTANCE_ID.agent37.app` |
| `AGENT37_AGENT` | Agent identifier supplied by Agent37 |
| `AGENT37_PROFILE` | Agent profile supplied by Agent37 |

### Create the Firebase service-account JSON

1. Open **Firebase Console → Project settings → Service accounts** for the same Firebase project used by HackVerse.
2. Generate a private key for a dedicated service account, if your organisation's security policy allows it. Give it only the permissions required for Firestore reads/writes and Firebase Authentication token verification. Avoid reusing a broadly privileged personal service account.
3. Copy the downloaded JSON file's complete contents into the Vercel value for `FIREBASE_SERVICE_ACCOUNT_JSON`. Vercel accepts the value as one JSON string. Keep the JSON exactly valid; private-key line breaks may be represented as `\n`.
4. Never put this JSON in `public/`, `firebase-config.js`, GitHub, this ZIP, a client-side `.env` file, or a screenshot. Never prefix it with `NEXT_PUBLIC_` or another public variable prefix.
5. Do not commit a real `.env` file. `.env.example` contains placeholders only.

The backend uses this credential to verify Firebase ID tokens and access the user's private AI conversation record. It sends the Agent37 key only from the Vercel server.

## 4. Preserve the browser Firebase configuration

The ZIP contains a browser Firebase configuration for project `hackverseneo`. Compare it with Firebase Console → Project settings → General → Your apps. If your live project uses a different Firebase project or web app, restore the correct `public/firebase-config.js` from your backup and make sure its `projectId` matches `FIREBASE_PROJECT_ID` and the service-account JSON. Do not add a Firebase Storage bucket; this project uses Supabase for chat media.

Firebase web configuration is intended to be present in the browser; Firestore security rules, not secrecy of the web API key, protect the data. The Agent37 key and service-account JSON are different: they must stay server-only.

## 5. Publish the updated Firestore rules

The updated `firestore.rules` and `firestore.indexes.json`:

- requires Firebase sign-in to read public opportunity/event records;
- permits only authenticated members (and authorised admins) to read the public event feed;
- stores AI conversation headers and messages so only the owning account can read or write them;
- adds participant-scoped read receipts, typing indicators and per-user reaction updates for messaging;
- includes the composite index needed to show the 30 most recently updated AI conversations;
- denies all browser access to `aiUsageDaily`; only the trusted Vercel backend updates that rate-limit collection.

Review the rules and deploy them from the project root. Storage files are managed by Supabase, so there is no Firebase Storage Rules deployment in this release:

```bash
firebase use hackverseneo
firebase deploy --only firestore:rules,firestore:indexes
```

Run this against the intended Firebase project. If your existing production rules contain additional collections or permissions not present in this release, merge and test those changes before replacing production rules. Compare the composite index list with the indexes already present in Firebase Console; merge any other production indexes you still need into `firestore.indexes.json` before deploying. Do not deploy rules or indexes blindly over a more recent live configuration.

## 6. Set up private chat media storage with Supabase (no Firebase Storage)

Firebase Storage is intentionally not used in this release. Current Firebase documentation states that Cloud Storage for Firebase buckets are unavailable to Spark-plan projects; using the Firebase Storage SDK can produce 402/403 errors unless the Firebase project is upgraded to Blaze. To keep media uploads separate from Firebase billing, HackVerse uses a private Supabase Storage bucket.

1. Open **https://supabase.com/dashboard** and create a Free project (or use an existing project). Choose a strong database password and keep it private.
2. In the Supabase dashboard, open **Storage → New bucket**. Name the bucket exactly `chat-media` and keep **Public bucket** switched OFF. This is important: private files must not be served through permanent public URLs.
3. Set the bucket's maximum file size to **15 MB**. Configure allowed types for images, video, audio, PDF, plain text, ZIP and common Office documents. The app and server enforce a 15 MB cap even though Supabase Free supports a larger per-file maximum.
4. Open **Project Settings → API**. Copy the Project URL and the publishable key (or legacy anon key). Put those two public values in `public/supabase-config.js`:

   ```js
   export const supabaseConfig = {
     url: "https://YOUR_PROJECT_REF.supabase.co",
     anonKey: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY",
     bucket: "chat-media"
   };
   ```

5. From the same API settings page, copy the **service_role** key. Add it only in **Vercel → Project → Settings → Environment Variables** as `SUPABASE_SERVICE_ROLE_KEY`. Also add `SUPABASE_URL` (the same Project URL) and `SUPABASE_STORAGE_BUCKET=chat-media`. Never put the service-role key in `public/supabase-config.js`, `public/app.js`, GitHub, a screenshot or this ZIP.
6. The `/api/chat-media` Vercel Function uses the service role to create short-lived upload tokens and 15-minute download URLs. Before it creates either, it verifies the Firebase ID token and checks that the account is a member of the relevant Firestore conversation. The browser receives only the time-limited token/URL it needs.
7. Supabase's current Free plan lists 1 GB of file storage and 5 GB egress. Free projects can pause after a period of inactivity, so this is suitable for a small starter deployment, not a guaranteed always-on commercial media service. Monitor quota and usage before inviting a large community.

If Supabase is not configured yet, ordinary text messages continue to work; image, document, audio, video and voice-note uploads show a setup message instead of silently failing.

## 7. What AI Wish can currently do

AI Wish is an action planner, not unrestricted control of every account and every external website. In this release it can prepare these actions:

- navigate to a HackVerse section;
- search the opportunity directory using a query, category, skill, or country;
- open an opportunity in the details modal;
- save an opportunity to the signed-in member's shortlist;
- search discoverable public builder profiles;
- create a project in the member's showcase (private by default; public only when requested);
- prepare a new group using exact discoverable profile IDs, with a separate consent confirmation;
- send a drafted message to one of the member's existing conversations, after a full action review and confirmation;
- change the interface theme, motion level or text size after confirmation.

The assistant displays the proposed actions and waits for the member to press **Apply these actions**. The website validates action types and event IDs before applying them. It does not currently send messages, delete content, change privacy settings, make admin decisions, submit applications to external organisers, spend money, or take arbitrary browser actions. Those require separate, permission-checked integrations and explicit confirmation flows.

## 8. History, identity and data flow

- A user must sign in to open the AI composer or create private AI history.
- Each conversation is owned by one Firebase UID. The browser only queries that user's conversation headers and messages.
- The corresponding Agent37 `session_id` is stored in that conversation's Firestore document so later turns continue the correct agent session.
- The backend verifies the Firebase ID token on every request. It does not trust a UID supplied by the browser.
- For context, the backend sends the user's public profile summary and up to 40 public opportunity records, plus the user's message and the current page. It does not intentionally send private phone/email fields.
- Each signed-in user is currently limited to 40 AI requests per UTC day by the server-side `DAILY_LIMIT` setting in `api/agent37/chat.js`.
- AI replies can be wrong. Review event details on the organiser's official page and review every AI Wish action before applying it. Review Agent37's privacy and data-handling terms before inviting real users to submit sensitive information.

## 9. Test before public launch

Use two separate Firebase test accounts and a non-production deployment where possible:

1. Signed out: confirm the home opportunity preview and opportunity directory show a sign-in gate; no event titles, details, deadlines or links are displayed.
2. Signed out: open a direct opportunity URL / modal attempt and confirm the app asks for sign-in. Confirm a direct Firestore read is denied by rules.
3. Signed in: confirm opportunities load and details open.
4. Signed in: open HackVerse AI, ask where to find saved opportunities, and check that the response is about HackVerse.
5. Start a new conversation, refresh the page, then reopen it from **Your history**. Confirm messages remain available.
6. Open **AI Wish** and ask it to search for an AI hackathon or create a project. Check the proposed actions, cancel once, then test **Apply** with a safe request.
7. Sign out and sign back in as the second account. Confirm the first account's history is not visible.
8. Check Vercel Function Logs if a request fails. A missing Agent37 key/instance ID, missing Firebase service account, incorrect project, sleeping Agent37 instance, or Agent37 API permission issue will prevent replies.

## 10. Troubleshooting

- **`Agent37 is not configured`:** check `AGENT37_INSTANCE_ID` and `AGENT37_API_KEY` in Vercel. Redeploy after changing environment variables.
- **Firebase service account error:** check that the JSON is complete, valid, and belongs to the same Firebase project as the frontend.
- **`401` from HackVerse AI:** sign in again; the endpoint requires a valid Firebase ID token.
- **Agent37 `401` / `403`:** check whether the key is valid for this personal agent and that the personal tier allows the API. Do not resolve this by adding a payment card or creating a Cloud Sandbox account.
- **`404` from `/api/agent37/chat`:** the API route is not deployed on the same Vercel project/domain as the frontend.
- **Function timeout / slow first answer:** a personal agent can sleep when idle and may need time to wake. The Vercel function is configured for a 300-second maximum; if the upstream agent does not return in time, check its dashboard and Vercel logs.
- **Events fail after rules deployment:** verify the signed-in query filters on `visibility == 'public'`, and make sure the Firestore rules you deployed are the updated rules for this application.

---

This integration is code-complete but requires your own Agent37 workspace API key, instance ID, Firebase service account, Supabase project and live deployments before it can be tested end-to-end. No credentials are included in this archive.

Useful current provider references: [Agent37 personal plan](https://www.agent37.com/personal), [Agent37 Send a message API](https://www.agent37.com/docs/agents-api/chat), [Agent37 sessions](https://www.agent37.com/docs/agents-api/sessions), and [Agent37 instance URLs](https://www.agent37.com/docs/agents-api/urls).
