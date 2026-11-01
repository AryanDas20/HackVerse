const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const Parser = require("rss-parser");
admin.initializeApp();
const db = admin.firestore();
const parser = new Parser({ timeout: 12000, headers: { "User-Agent": "HackVerseEventIndexer/1.0" } });
const RSS_FEEDS = defineString("HACKVERSE_RSS_FEEDS", { default: "" });

/**
 * Configure only public RSS feeds whose terms permit event discovery and
 * redistribution of minimal metadata. Do not add social URLs here.
 */
async function ingestApprovedRssFeeds() {
  const feeds = RSS_FEEDS.value().split(",").map(x => x.trim()).filter(Boolean);
  const runRef = db.collection("ingestionRuns").doc();
  const summary = { startedAt: admin.firestore.FieldValue.serverTimestamp(), feedCount: feeds.length, imported: 0, errors: [] };
  for (const feedUrl of feeds) {
    try {
      const feed = await parser.parseURL(feedUrl);
      for (const item of (feed.items || []).slice(0, 50)) {
        const link = item.link;
        if (!link) continue;
        const normalized = {
          title: String(item.title || "Untitled event").slice(0, 180),
          organizer: feed.title || "RSS publisher",
          sourcePlatform: "RSS",
          sourceType: "Community",
          sourceUrl: link,
          officialEventUrl: link,
          officialRegistrationUrl: null,
          summary: String(item.contentSnippet || item.summary || "").slice(0, 420),
          registrationDeadline: null,
          startAt: null, endAt: null, timezone: null,
          mode: null,
          tracks: [], technologies: [], tags: [],
          verificationStatus: "Needs review",
          status: "Needs review",
          visibility: "moderation",
          ingestedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        const key = Buffer.from(link).toString("base64url").slice(0, 100);
        const ref = db.collection("sourceItems").doc(key);
        await ref.set({ rawMinimal: { title: normalized.title, link }, normalized, sourceFeed: feedUrl, seenAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        summary.imported++;
      }
    } catch (err) {
      summary.errors.push({ feed: feedUrl, message: String(err.message).slice(0, 180) });
      logger.warn("RSS feed ingestion failed", { feedUrl, error: err.message });
    }
  }
  await runRef.set({ ...summary, finishedAt: admin.firestore.FieldValue.serverTimestamp() });
  return summary;
}
exports.scheduledRssIngestion = onSchedule("every 6 hours", async () => ingestApprovedRssFeeds());
exports.manualRssRefresh = onCall({ enforceAppCheck: true }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  if (request.auth.token.admin !== true) throw new HttpsError("permission-denied", "Admin custom claim required.");
  return ingestApprovedRssFeeds();
});

/**
 * Social connectors intentionally are not implemented as scrapers.
 * Add one adapter per approved official API after credentials, scopes,
 * retention rules, and platform display requirements are reviewed.
 */
exports.socialConnectorStatus = onCall({ enforceAppCheck: true }, async request => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  return {
    supportedPattern: "official-api-or-authorized-connection-only",
    connectors: {
      x: "not-configured", linkedin: "not-configured", meta: "not-configured",
      reddit: "not-configured", discord: "not-configured", telegram: "not-configured",
      youtube: "not-configured"
    }
  };
});