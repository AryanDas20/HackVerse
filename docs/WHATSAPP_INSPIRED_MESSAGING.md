# HackVerse messaging — capability guide (v5.5)

The messaging UI is a WhatsApp-inspired collaboration interface, not an official WhatsApp product and not an exact implementation of WhatsApp's proprietary protocols.

## Included in this release
- Direct messages and member groups using the existing Firestore `conversations/{id}/messages` data model.
- Realtime inbox and message snapshots.
- All, Unread, Groups and Archived inbox filters. Pin, archive and star preferences are browser-local.
- Reply previews, emoji reactions, copy, forward (text only) and starred messages.
- Edit and soft-delete of the sender's own messages during the 15-minute editing window.
- Image, video, audio and common document attachments up to 15 MB, stored in a **private Supabase Storage bucket**.
- Browser-recorded voice notes using MediaRecorder and microphone permission.
- Typing indicators under `conversations/{id}/typing/{uid}`.
- Per-member read timestamps on the conversation document and read ticks in the message view.
- Group membership management for owners and admins.
- An activity centre combining unread/recent chat activity with reminders for saved opportunities whose registration deadlines are within 14 days.

## Media privacy and storage setup
- Files are uploaded using short-lived Supabase signed-upload tokens issued by `/api/chat-media` only after the server verifies the Firebase ID token and conversation membership.
- Firestore stores a private object path, not a permanent public media URL. The same server verifies membership again before creating 15-minute signed download URLs.
- The bucket must be **private**, named `chat-media` unless you change `SUPABASE_STORAGE_BUCKET`, and limited to the approved file types and 15 MB at the app layer.
- The Supabase service-role key belongs only in Vercel's server-side `SUPABASE_SERVICE_ROLE_KEY` variable. The browser `public/supabase-config.js` contains only the project URL and publishable/anon key.
- Firebase Storage is deliberately not used. Firebase's current pricing/help materials state Cloud Storage for Firebase is unavailable to Spark projects; using Supabase avoids requiring a Firebase billing upgrade for chat media.

## Not yet implemented
End-to-end encryption, voice/video calls, disappearing messages, channel communities, cross-device sync for pin/archive/star preferences, background push notifications when the browser is closed, and WhatsApp's full backup/restore system. These require dedicated backend and security work.
