# System Architecture

## MVP topology
Browser (HTML/CSS/ES modules) → Firebase Authentication → Firestore (user profiles, saved events, public approved hackathons) → Cloud Functions (scheduled ingestion, callable admin refresh) → approved public RSS feeds.

Firebase Hosting serves static assets. Firebase Storage is reserved for user-uploaded portfolio assets. Cloud Functions are the trusted boundary for secrets, ingestion, privileged writes, AI calls, and API integrations.

## Production topology (target)
Source adapters → queue/scheduler → raw source store → normalization and enrichment → deduplication/entity resolution → moderation queue → approved event store → indexed search (Algolia/Meilisearch) → web/mobile clients. Observability and audit logging span all workers.

## Trust boundaries
- Browser may read public events and write only to the signed-in user's own profile/saved subcollections.
- Browser must never hold source API secrets, AI provider keys, service-account credentials, or admin credentials.
- Only trusted server processes can publish or edit public events.
- Admin role assignment must be performed by a privileged operator using Firebase Admin SDK/custom claims or a controlled admin provisioning function.
- Social sources require platform-specific API approval, scopes, retention, and display compliance.

## Suggested scaling path
1. Firebase-only MVP.
2. Add Cloud Tasks/Pub/Sub for ingestion fan-out and retry.
3. Add dedicated search index for typo tolerance/facets.
4. Move high-volume event history and analytics to PostgreSQL/BigQuery if Firestore query/cost patterns justify it.
5. Add Redis only when measurable caching/queue needs emerge.
