# HackTheta AI Pitch Arena

AI Pitch Arena is an additive feature for the existing Vanilla JavaScript HackTheta application. It reuses the current Supabase authentication and document-store adapter, the existing Vercel API environment, and the Agent37 Responses API integration pattern.

## What is included

- `/pitch-arena` route and More-menu navigation item.
- Private uploads for PDF, ZIP, PPTX, DOCX, README, Markdown, text and common source/configuration files.
- Server-side ZIP/DOCX/PPTX text extraction with traversal checks, file-count limits, decompression caps and ignored dependency/build folders. Uploaded source is never executed.
- PDF text extraction through PDF.js in the browser, with page references in the extracted text. The first 40 pages and up to 30,000 characters per PDF are processed; the original PDF is stored in the private bucket.
- Project evidence analysis that distinguishes `verified_in_source_code`, `described_in_documentation`, `claimed_by_participant`, `not_found` and `contradictory_evidence`.
- Five judge personas, turn-based adaptive questioning, answer-level evaluation, deterministic final-rubric total calculation, saved sessions, resume, previous reports and a 7-day improvement plan.
- Local webcam preview, optional browser speech recognition, browser speech synthesis and text-only fallback. HackTheta does not store webcam footage or raw microphone recordings; the browser speech-recognition provider may process audio under its own privacy terms, and HackTheta sends the returned transcript to Agent37.
- Print / Save as PDF report layout using the browser print dialog.

## Required deployment configuration

Keep the existing Vercel environment variables:

```text
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
AGENT37_API_KEY=YOUR_AGENT37_API_KEY
AGENT37_INSTANCE_ID=YOUR_AGENT37_INSTANCE_ID
```

Optional variables already supported by the existing Agent37 route:

```text
AGENT37_INSTANCE_URL=https://YOUR_INSTANCE.agent37.app
AGENT37_AGENT=YOUR_AGENT_NAME
AGENT37_PROFILE=YOUR_AGENT_PROFILE
AGENT37_REASONING_EFFORT=high
```

Do not put the service-role key or Agent37 API key in browser code. The public Supabase anon/publishable key remains in `public/supabase-config.js`, as in the existing project.

No new AI provider credentials are introduced. The Arena uses the existing Agent37 server-side integration. AI requests use the existing Agent37 `/v1/responses` route pattern. Browser speech recognition and text-to-speech use the browser's available Web Speech APIs; support differs by browser.

## Supabase setup

1. Back up the existing Supabase project.
2. Open Supabase Dashboard → SQL Editor.
3. Run `supabase-pitch-arena.sql`.
4. Confirm the private `pitch-arena-private` Storage bucket exists.
5. Confirm the Vercel project has `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AGENT37_API_KEY` and `AGENT37_INSTANCE_ID` configured for the deployed environment.
6. Redeploy the Vercel project.
7. Sign into HackTheta and open **More → AI Pitch Arena**.

The migration is additive. It creates the private storage bucket and per-user storage policies. The API creates owner-scoped `pitchArenaProjects` and `pitchArenaSessions` records in the existing `documents` table using the existing server-side store. It does not require replacing the current Supabase schema or identity system.

## Upload and privacy limits

- Up to 12 uploaded files per project.
- 12 MB per file and 30 MB total in the browser UI.
- ZIP extraction: maximum 120 entries and 10 MB of extracted text-file data; dependency and build folders are ignored.
- Extracted evidence sent to Agent37 is capped at approximately 125,000 characters per project.
- Common private-key blocks and common API-key patterns are redacted before AI analysis. Review your files before uploading; no automated redaction can guarantee that every secret format is detected.
- Legacy binary `.doc` and `.ppt` are not parsed. Convert them to `.docx`, `.pptx` or PDF first.
- PDFs are stored privately and their text is extracted with PDF.js in the browser. Scanned/image-only PDFs may produce little or no text; use an accessible/text-based PDF or add a README.
- ZIP files are parsed in memory on the server. The archive is not written to disk and no uploaded code is executed.
- The feature stores extracted project text, interview transcripts, scores and reports in the existing private document store. It does not store webcam footage or audio recordings.

## Interview behaviour and limitations

- AI question generation and evaluation are request/response turns through Agent37. It is not a streaming real-time voice model or WebRTC call.
- Browser `SpeechRecognition` is only available in supported browsers (commonly Chromium-based browsers). When unavailable or denied, the participant can type answers. The browser vendor controls any processing performed by its speech-recognition service; HackTheta stores the transcript, not the raw microphone stream.
- Browser `speechSynthesis` reads judge prompts aloud when supported. The judge is a CSS-animated avatar, not a generated live video feed or a true lip-synchronised 3D avatar.
- The webcam is a local preview only. No facial-expression, eye-contact or body-language scoring is implemented.
- The final score is the deterministic sum of AI-assessed category marks, clamped to the fixed rubric weights. It is a practice assessment, not a prediction or guarantee of real hackathon judging results.
- Each authenticated user is limited by the existing `consume_ai_daily_limit` RPC to 40 AI requests per day, shared with existing HackTheta AI usage.

## Troubleshooting

**Upload fails with a bucket/policy error:** run `supabase-pitch-arena.sql` and confirm storage policies were created for `pitch-arena-private`.

**Agent37 is not configured:** add the existing server-only Agent37 environment variables to Vercel and redeploy.

**The interview opens but speech input is unavailable:** use a browser with Web Speech `SpeechRecognition` support, allow microphone permission, or type the answer. Camera and microphone permission are optional.

**AI request times out:** try a smaller project ZIP (exclude generated files, dependencies and binaries), reduce the number of uploaded documents, or retry when the Agent37 instance is available.

## Test commands

```bash
npm run check
npm test
```

These checks validate JavaScript syntax and the repository's existing unit tests. They do not validate live Supabase policies, Storage uploads, the Agent37 instance, browser camera/microphone permissions or a deployed Vercel function; those require a staging deployment and a signed-in browser test.


## Premium access and API routing

AI Pitch Arena is treated as a premium AI feature in the HackTheta build. The backend checks the signed-in user's `billing_subscriptions` record using the same `getEntitlement` logic as the existing AI and Career Match services. An eligible, unexpired trial or a valid paid entitlement is required; a frontend-only route check is not relied upon for security.

The `/api/pitch-arena` URL is kept for the browser client, but Vercel rewrites it to the existing `/api/agent37/chat` function with an internal `action=pitch-arena` selector. The Arena handler lives in `lib/pitch-arena.js`, outside the deployable `api/` directory. This avoids adding a thirteenth Serverless Function. The project check script reports the actual source-level API candidates; a Vercel deployment is still needed to confirm the platform's final function count.
