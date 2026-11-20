# HackVerse v16 — Career Toolkit expansion

## Career Match upgrades

- Added a placement command-centre illustration and subtle floating UI motion.
- Added animated analysis stages for PDF reading, layout reconstruction/OCR, skill matching and learning-plan generation.
- Added browser-local resume health and readability checklist, role skill-category map, and job-description clarity signals. The health checklist is heuristic; it is not an ATS vendor score or hiring prediction.
- Added must-have / preferred labels to missing skills and source evidence from both the resume and job description.
- Expanded the deterministic skill catalogue to 130 canonical skills with unique catalogue keys and non-colliding aliases.
- Added a checkable 14-day learning sprint with local progress persistence.
- Added a role-aware interview question deck, STAR guide, locally saved practice notes, two-minute timer and a transparent answer-structure self-review.
- Added a cover-letter draft helper and a resume-bullet workshop that warns against inventing metrics.
- Added an eight-point portfolio proof checklist.
- Added a private, device-local application pipeline with stages, next dates, links and notes.
- Added text report export and print-friendly report output.

## Privacy and storage

- Resume PDF parsing and OCR happen in the browser. Extracted resume text is sent to the authenticated analysis endpoint for a single request and is not written to Supabase by that endpoint.
- Learning progress, interview notes, portfolio checklist and application tracking are stored in this browser's local storage, namespaced by the signed-in account ID when available. They are not synced across devices. Avoid using these local tools on shared computers; clear browser site data when appropriate.
- No Supabase migration or new server environment variable is introduced by this feature expansion.

## Verification

- `npm run check` — passed.
- `npm test` — 60 tests passed.
- Catalogue audit — 130 unique skill keys and no duplicate aliases.
- Actual browser upload, OCR accuracy across varied resumes, production authentication, Vercel deployment and the judge-made 70% agreement benchmark still require staging/production validation.
