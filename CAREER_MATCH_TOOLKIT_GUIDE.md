# Career Match — Placement Toolkit Guide

## Main workflow

1. Sign in and open **Career Match** from the main navigation.
2. Upload a PDF resume and paste the full job description.
3. Start analysis. The visual progress panel shows PDF reading, layout reconstruction/OCR, skill matching and learning-plan generation.
4. Review the match percentage, matched skills, missing skills and original JD evidence. Matched skills include snippets from the extracted resume text.
5. Use the six toolkit tabs to prepare for the application.

## Toolkit tabs

- **Resume intelligence:** Structure/readability checklist, job-description signals and skill coverage by category. The readiness percentage is a simple checklist indicator, not a proprietary ATS score.
- **Skill sprint:** Tick each day as you complete the learning task. Progress is saved on this device.
- **Interview Lab:** Select generated technical, scenario, project or behavioural prompts. Save your draft response locally, use the two-minute timer, and review the STAR structure checklist. This checklist checks response structure only and does not assess technical correctness.
- **Career Studio:** Draft a cover letter with your own company, role, motivation and evidence. The bullet workshop helps structure a real achievement; users must supply and verify every metric and outcome.
- **Portfolio audit:** Track whether project proof is recruiter-ready.
- **Application tracker:** Save companies, roles, stages, dates, job links and private notes in browser storage.

## Privacy

- Resume PDF and extracted resume text are not persisted by the Career Match endpoint.
- Career toolkit drafts, notes, checklists and application tracker data use browser local storage, separated by the signed-in account ID in that browser. They do not sync to Supabase or other devices. Local storage is not encrypted; do not use the tracker or notes on shared devices unless you are comfortable with local browser storage.

## Important limitations

- Skill matching is based on a deterministic 130-skill catalogue and explicit aliases. Terms outside the catalogue can be missed. Review the original job description.
- JD evidence is the original extracted line, not a guarantee that the requirement was interpreted correctly.
- PDF extraction and OCR can be affected by poor scans, handwriting, unusual fonts, columns that overlap, tables, rotations or damaged/password-protected files.
- OCR currently uses English. The app retains the current upload size/page limits.
- The resume-health checklist and interview answer review are transparent heuristics, not ATS vendor scores, recruiter ratings or AI judgement.
- Application tracking is local-only and has no automatic email/calendar reminders.
- The 70% judge agreement requirement must be evaluated using the actual judge-approved answer key. The sample key is not a substitute.
