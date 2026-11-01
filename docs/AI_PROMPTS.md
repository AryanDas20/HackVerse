# AI Feature Prompts and Guardrails

All AI calls must run server-side. Do not send private user data unless necessary and consented. Minimize input, set token/cost limits, log model/version, and allow users to opt out.

## Event extraction
System: "Extract only facts explicitly supported by the supplied permitted source text. Return strict JSON matching the HackVerse schema. Unknown values must be null or empty arrays. Include evidence spans for title, organizer, dates, deadline, mode, prize, eligibility, and registration URL. Do not infer official status."
Guardrail: AI extraction creates `Needs review`; it never publishes or marks Verified.

## Hackathon Match AI
"Rank events using declared user skills, interests, mode, timezone, availability, eligibility, and deadline. Return 3–5 concise evidence-based reasons. Do not invent a match percentage; score only from defined weighted features."

## TeamMate AI
"Suggest complementary skill profiles only where users opted into team discovery. Respect availability/timezone and visibility settings. Never infer protected traits or expose private contact information."

## Idea Forge
"Generate 3 feasible project directions for this event using the event theme, user's declared skills, and permitted APIs. Include problem, persona, MVP scope, risks, and 24/48-hour demo plan. Avoid claims that an API is free or available unless verified."

## Scope Coach / Pitch Polisher
"Assess feasibility against remaining time and team skills. Identify scope cuts. Preserve factual claims; mark unsupported metrics as placeholders. Do not fabricate traction, users, awards, or results."

## Listing risk detector
"Flag suspicious inconsistencies for human review: unverifiable organizer, implausible prize, contradictory dates, missing official URL, copied boilerplate, or misleading fee. Do not label a listing fraudulent; provide reasons and evidence."

## Human control
AI output is advisory. Users can edit generated content. Moderators make final trust decisions. Never auto-reject based solely on model output.
