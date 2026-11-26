# HackTheta — AI Pitch Arena integration

AI Pitch Arena has been merged into the newer HackTheta project ZIP. The newer HackTheta source remains the base; the older Arena ZIP contributes the Arena page, client, API logic, stylesheet, setup SQL and wiring test.

## Included Arena capabilities

- Additive **More → AI Pitch Arena** navigation and `/pitch-arena` route.
- Upload a project for evidence-based analysis: PDF, ZIP, PPTX, DOCX, README, text and supported source/configuration files.
- Five simulated judges covering technical architecture, business/product, innovation, critical review and presentation.
- Turn-based pitch interview with follow-up questions, challenge questions, answer-level assessment and score rubric.
- Optional local camera preview, browser speech input/output where supported, and text-only fallback.
- Private project uploads, saved interview sessions, resume/history and a printable report with category marks and a seven-day improvement plan.

## One-time Supabase setup

1. Back up the existing Supabase project.
2. Open the existing Supabase project → SQL Editor.
3. Run `supabase-pitch-arena.sql`.
4. Confirm the `pitch-arena-private` bucket exists and is **private**.
5. Do not replace the current Supabase project or service-role key.

The feature writes project and interview metadata to the existing `documents` table through the server-side adapter. It does not create a replacement database or delete existing records. It relies on the current `consume_ai_daily_limit(p_user_id, p_daily_limit)` database function and uses the existing 40-request daily AI limit.

## Vercel environment variables

Confirm these existing server-side variables are already configured in Vercel:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
AGENT37_API_KEY=
AGENT37_INSTANCE_ID=
```

Optional existing Agent37 settings:

```env
AGENT37_INSTANCE_URL=
AGENT37_AGENT=
AGENT37_PROFILE=
AGENT37_REASONING_EFFORT=high
```

Never place `SUPABASE_SERVICE_ROLE_KEY` or `AGENT37_API_KEY` in browser JavaScript. No new AI provider is required.

## Access and routing

AI Pitch Arena is free to use for every signed-in HackTheta account. There is no trial, subscription, checkout, or payment entitlement check. The server still verifies the user's Supabase session and ownership of every private project and interview record.

The frontend keeps calling `/api/pitch-arena`. Vercel rewrites that URL to the existing `/api/agent37/chat` function with `action=pitch-arena`; that function dispatches to `lib/pitch-arena.js`.

## Deploy

From the project root:

```bash
npm run check
npm test
```

Then commit and push the changes to the existing repository/production branch. Redeploy the existing Vercel project. After deployment, sign in with any HackTheta account and open **More → AI Pitch Arena**.

## Verification and limitations

Local checks completed for this package: JavaScript syntax validation and all 82 automated tests. This environment did not connect to your Supabase project, Agent37 instance, browser camera/microphone, or Vercel deployment. Therefore private Storage uploads, live AI turns, private Storage access against your real data and Vercel routing still need a signed-in staging/production test.

The interview is a turn-based Agent37 simulation, not a real-time WebRTC call. The camera is local preview only; no video is uploaded or scored. Browser speech recognition availability and privacy behaviour depend on the browser's speech service. Scores are simulated practice assessments, not guaranteed hackathon results.
