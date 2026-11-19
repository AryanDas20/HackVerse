# HackVerse v19 — profile visibility, readable type, and legacy directory recovery

## Profile setup
- Moved profile visibility and the public Builders directory opt-in into Step 02, where the choices are prominent and visible without opening a dropdown.
- Added selectable Public, Followers-only, and Private cards with short explanations.
- Kept directory listing consent separate from profile visibility. A profile appears in the public Builders directory only when visibility is Public and the member confirms the directory checkbox.
- Kept phone and email visibility separate in Step 04. They remain private unless the member explicitly chooses Everyone.
- Increased the general type baseline to 16px, helper and metadata text to at least 13px, and form descriptions to 14–15px. Inputs and buttons are larger for comfortable desktop and mobile reading.
- Highlighted the Step 02 heading itself and automatically opens Step 02 in the profile editor.

## Legacy Builders directory recovery
- Added `/api/profile-directory-reconcile`, an authenticated server-side recovery endpoint.
- It reads legacy account documents using the existing Supabase service-role configuration and creates only missing `publicProfiles` records.
- Legacy profiles are eligible when they predate the separate consent field and their saved profile visibility was explicitly Public (including older `Public` / `PUBLIC` labels). Current profiles with a present but empty consent field are not backfilled.
- Private email and phone fields are never copied from private account records. Only explicitly public contact fields are included.
- Recovery runs after sign-in, is rate-limited in the browser to once per day, and globally throttled for ten minutes per warm API instance so concurrent members do not each trigger a full scan. It only logs counts.
- The Builders directory now loads 48 members per page and provides a Load more control, replacing the previous hard cap of 24 profiles.

## Database and deployment
- No SQL migration or new environment variable is required.
- The existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` Vercel environment variables are used by the authenticated recovery endpoint.
- Deploy the complete project so the UI, API endpoint, and styles stay in sync.
