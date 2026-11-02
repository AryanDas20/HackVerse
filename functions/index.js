const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const Parser = require("rss-parser");
const crypto = require("node:crypto");

initializeApp();
const db = getFirestore();
const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "HackVerseDiscovery/2.0 (+https://hackverse.example; contact: admin@hackverse.example)" },
  customFields: { item: [["content:encoded", "contentEncoded"], ["media:description", "mediaDescription"]] }
});
const LEGACY_FEEDS = process.env.HACKVERSE_STANDALONE === "1"
  ? { value: () => process.env.HACKVERSE_RSS_FEEDS || "" }
  : defineString("HACKVERSE_RSS_FEEDS", { default: "" });
const YOUTUBE_API_KEY = process.env.HACKVERSE_STANDALONE === "1"
  ? { value: () => process.env.HACKVERSE_YOUTUBE_API_KEY || "" }
  : defineString("HACKVERSE_YOUTUBE_API_KEY", { default: "" });
const YOUTUBE_QUERIES = process.env.HACKVERSE_STANDALONE === "1"
  ? { value: () => process.env.HACKVERSE_YOUTUBE_QUERIES || "hackathon registration;student hackathon;hackathon challenge" }
  : defineString("HACKVERSE_YOUTUBE_QUERIES", { default: "hackathon registration;student hackathon;hackathon challenge" });
const SERVER_TIME = FieldValue.serverTimestamp;

function sha(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }
function cleanText(value, max = 1200) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim().slice(0, max);
}
function safeHttps(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host) || host.endsWith(".local")) return null;
    return url.toString();
  } catch { return null; }
}
function canonicalUrl(value) {
  const safe = safeHttps(value);
  if (!safe) return "";
  const u = new URL(safe); u.hash = "";
  for (const key of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(key)) u.searchParams.delete(key);
  u.searchParams.sort();
  return u.toString().replace(/\/$/, "");
}
function extractDeadline(text) {
  const source = String(text || "");
  const patterns = [
    /(?:registration|application|submission)?\s*deadline\s*[:\-–]?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+20\d{2})/i,
    /(?:registration|application|submission)?\s*deadline\s*[:\-–]?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+20\d{2})/i,
    /(?:register|apply|submit)\s+(?:by|before)\s+([A-Za-z]{3,9}\s+\d{1,2},?\s+20\d{2})/i,
    /(?:registration|application|submission)?\s*deadline\s*[:\-–]?\s*(20\d{2}-\d{2}-\d{2})/i
  ];
  for (const re of patterns) {
    const match = source.match(re);
    if (match) { const date = new Date(match[1]); if (!Number.isNaN(date.getTime())) return date; }
  }
  return null;
}
function classify(text) {
  const value = String(text || "").toLowerCase();
  const strong = /\bhackathon\b|\bhack-a-thon\b/.test(value);
  const weak = /\bhack\b.{0,30}\b(build|event|challenge|competition)\b/.test(value);
  return { relevant: strong || weak, score: strong ? 90 : weak ? 65 : 0 };
}
function extractTags(text) {
  const vocab = ["AI / ML", "Web3", "Blockchain", "Climate", "Fintech", "Healthcare", "Education", "Gaming", "Cybersecurity", "Open innovation", "Robotics", "Data science", "Developer tools"];
  const lower = String(text || "").toLowerCase();
  return vocab.filter(tag => lower.includes(tag.toLowerCase().replace(" / ", " ")) || lower.includes(tag.toLowerCase())).slice(0, 8);
}
function parseCandidate(item, source) {
  const title = cleanText(item.title, 180);
  const summary = cleanText(item.contentSnippet || item.summary || item.contentEncoded || item.content || item.description || "", 1600);
  const text = `${title} ${summary}`;
  const relevance = classify(text);
  const sourceUrl = canonicalUrl(item.link || item.url || "");
  if (!title || !sourceUrl || !relevance.relevant) return null;
  const deadline = extractDeadline(text);
  const now = new Date();
  const expired = deadline && deadline.getTime() < now.getTime();
  const id = sha(sourceUrl).slice(0, 40);
  const titleKey = sha(title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()).slice(0, 40);
  return {
    id, titleKey, title, organizer: cleanText(source.name || item.creator || item.author || "Source publisher", 120),
    summary: summary || "An event announcement was discovered by HackVerse. Visit the original source for complete details.",
    sourceUrl, officialEventUrl: null,
    officialRegistrationUrl: null, registrationDeadline: deadline ? Timestamp.fromDate(deadline) : null,
    startAt: null, endAt: null, timezone: null, mode: null,
    tracks: extractTags(text), technologies: [], tags: extractTags(text),
    sourcePlatform: source.platform || "RSS", sourceType: source.category || "Community",
    sourceName: cleanText(source.name || "RSS publisher", 120),
    verificationStatus: "source-attributed", status: expired ? "expired" : "upcoming",
    visibility: source.autoPublish === false ? "moderation" : "public",
    autoPublished: source.autoPublish !== false, discoveryScore: relevance.score,
    sourcePublishedAt: (() => { const d = item.isoDate || item.pubDate ? new Date(item.isoDate || item.pubDate) : null; return d && !Number.isNaN(d.getTime()) ? d : null; })(),
    ingestedAt: SERVER_TIME(), updatedAt: SERVER_TIME(), lastSeenAt: SERVER_TIME(),
    sourceIds: [source.id]
  };
}
function isDuplicateCandidate(data) {
  // Conservative: only publish clearly hackathon-related posts with an https source link.
  return Boolean(data && data.title && data.sourceUrl && data.discoveryScore >= 65);
}
async function storeCandidate(candidate) {
  const urlFingerprint = db.collection("eventFingerprints").doc(sha(candidate.sourceUrl));
  const titleFingerprint = db.collection("eventFingerprints").doc(`title_${candidate.titleKey}`);
  let eventId = candidate.id;
  await db.runTransaction(async tx => {
    const [urlSnap, titleSnap] = await Promise.all([tx.get(urlFingerprint), tx.get(titleFingerprint)]);
    eventId = urlSnap.exists ? urlSnap.data().eventId : (titleSnap.exists ? titleSnap.data().eventId : candidate.id);
    const eventRef = db.collection("hackathons").doc(eventId);
    const existing = await tx.get(eventRef);
    const previous = existing.exists ? existing.data() : {};
    const sources = [...new Set([...(previous.sourceIds || []), ...(candidate.sourceIds || [])])].slice(0, 20);
    const merged = {
      ...candidate,
      ...(!candidate.registrationDeadline && previous.registrationDeadline ? { registrationDeadline: previous.registrationDeadline } : {}),
      ...(previous.officialRegistrationUrl ? { officialRegistrationUrl: previous.officialRegistrationUrl } : {}),
      ...(previous.startAt ? { startAt: previous.startAt } : {}),
      ...(previous.endAt ? { endAt: previous.endAt } : {}),
      ...(previous.mode ? { mode: previous.mode } : {}),
      sourceIds: sources,
      firstSeenAt: previous.firstSeenAt || SERVER_TIME(),
      updatedAt: SERVER_TIME(), lastSeenAt: SERVER_TIME()
    };
    // Once a human/admin enriches official details, RSS refreshes do not overwrite them.
    if (previous.organizerVerified === true) {
      merged.organizer = previous.organizer;
      merged.officialEventUrl = previous.officialEventUrl;
      merged.officialRegistrationUrl = previous.officialRegistrationUrl;
      merged.verificationStatus = previous.verificationStatus;
    }
    tx.set(eventRef, merged, { merge: true });
    tx.set(urlFingerprint, { eventId, updatedAt: SERVER_TIME() }, { merge: true });
    tx.set(titleFingerprint, { eventId, updatedAt: SERVER_TIME() }, { merge: true });
  });
  return eventId;
}
async function readEnabledSources() {
  const snap = await db.collection("discoverySources").where("enabled", "==", true).limit(50).get();
  const sources = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.type === "rss" && safeHttps(s.feedUrl));
  const legacy = LEGACY_FEEDS.value().split(",").map(x => safeHttps(x.trim())).filter(Boolean)
    .map(url => ({ id: sha(url).slice(0, 20), name: new URL(url).hostname, type: "rss", platform: "RSS", feedUrl: url, enabled: true, autoPublish: true }));
  const seen = new Set(sources.map(s => canonicalUrl(s.feedUrl)));
  for (const item of legacy) if (!seen.has(canonicalUrl(item.feedUrl))) sources.push(item);
  return sources;
}
async function ingestYouTube(summary) {
  const apiKey = YOUTUBE_API_KEY.value().trim();
  if (!apiKey) return;
  const queries = YOUTUBE_QUERIES.value().split(";").map(x => x.trim()).filter(Boolean).slice(0, 5);
  const publishedAfter = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  for (const searchTerm of queries) {
    try {
      const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
      endpoint.search = new URLSearchParams({
        part: "snippet", q: searchTerm, type: "video", order: "date", maxResults: "25",
        publishedAfter, key: apiKey
      }).toString();
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`YouTube API returned HTTP ${response.status}`);
      const body = await response.json();
      const items = body.items || []; summary.fetched += items.length;
      for (const item of items) {
        const candidate = parseCandidate({
          title: item.snippet?.title,
          contentSnippet: item.snippet?.description,
          link: item.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : "",
          isoDate: item.snippet?.publishedAt
        }, { id: "youtube-data-api", name: item.snippet?.channelTitle || "YouTube channel", type: "youtube", platform: "YouTube", category: "Social media", autoPublish: true });
        if (!candidate || !isDuplicateCandidate(candidate)) continue;
        summary.relevant++;
        await storeCandidate(candidate); summary.published++;
      }
    } catch (error) {
      summary.errors.push({ source: `YouTube search: ${searchTerm}`, message: String(error.message || error).slice(0, 180) });
      logger.warn("YouTube discovery failed", { searchTerm, error: error.message });
    }
  }
}
async function expirePastDeadlines() {
  const now = Timestamp.now();
  const snap = await db.collection("hackathons").where("registrationDeadline", "<=", now).limit(350).get();
  const due = snap.docs.filter(doc => doc.data().visibility === "public" && doc.data().status !== "expired");
  if (!due.length) return 0;
  const batch = db.batch();
  due.forEach(doc => batch.set(doc.ref, { status: "expired", expiredAt: SERVER_TIME(), updatedAt: SERVER_TIME() }, { merge: true }));
  await batch.commit();
  return due.length;
}
async function runDiscovery() {
  const runRef = db.collection("ingestionRuns").doc();
  const summary = { startedAt: new Date(), sourceCount: 0, fetched: 0, relevant: 0, published: 0, held: 0, duplicates: 0, errors: [] };
  try {
    const sources = await readEnabledSources(); summary.sourceCount = sources.length;
    for (const source of sources) {
      try {
        const feedUrl = safeHttps(source.feedUrl);
        if (!feedUrl) throw new Error("Feed URL must use HTTPS and must not point to localhost.");
        const feed = await parser.parseURL(feedUrl);
        const items = (feed.items || []).slice(0, 60); summary.fetched += items.length;
        for (const item of items) {
          const candidate = parseCandidate(item, source);
          if (!candidate || !isDuplicateCandidate(candidate)) continue;
          summary.relevant++;
          if (candidate.visibility !== "public") { summary.held++; continue; }
          await storeCandidate(candidate); summary.published++;
        }
        await db.collection("discoverySources").doc(source.id).set({ lastRunAt: SERVER_TIME(), lastError: null, lastItemCount: items.length }, { merge: true }).catch(() => {});
      } catch (error) {
        summary.errors.push({ source: source.name || source.id, message: String(error.message || error).slice(0, 180) });
        logger.warn("HackVerse source ingestion failed", { sourceId: source.id, error: error.message });
        if (source.id && !source.id.match(/^[a-f0-9]{20}$/)) {
          await db.collection("discoverySources").doc(source.id).set({ lastRunAt: SERVER_TIME(), lastError: String(error.message || error).slice(0, 180) }, { merge: true }).catch(() => {});
        }
      }
    }
    await ingestYouTube(summary);
  } catch (error) {
    summary.errors.push({ source: "discovery", message: String(error.message || error).slice(0, 180) });
    logger.error("Discovery run failed", error);
  }
  try { summary.expired = await expirePastDeadlines(); } catch (error) { summary.errors.push({ source: "expiry", message: String(error.message || error).slice(0, 180) }); }
  summary.finishedAt = new Date();
  await runRef.set(summary);
  return { ...summary, runId: runRef.id };
}
function requireAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (request.auth.token.admin !== true) throw new HttpsError("permission-denied", "This action requires a HackVerse admin account.");
}
if (process.env.HACKVERSE_STANDALONE === "1") {
  runDiscovery()
    .then(result => {
      console.log("HackVerse discovery result:");
      console.log(JSON.stringify(result, null, 2));
      if (result.errors && result.errors.length) process.exitCode = 1;
    })
    .catch(error => {
      console.error("HackVerse discovery failed:", error);
      process.exitCode = 1;
    });
} else {
exports.scheduledRssIngestion = onSchedule({ schedule: "every 6 hours", timeZone: "Asia/Kolkata", timeoutSeconds: 540, memory: "512MiB" }, async () => runDiscovery());
exports.runDiscoveryNow = onCall({ enforceAppCheck: false }, async request => { requireAdmin(request); return runDiscovery(); });
exports.addDiscoverySource = onCall({ enforceAppCheck: false }, async request => {
  requireAdmin(request);
  const name = cleanText(request.data?.name, 100);
  const feedUrl = safeHttps(request.data?.feedUrl);
  if (!name || !feedUrl) throw new HttpsError("invalid-argument", "Provide a source name and a valid HTTPS RSS feed URL.");
  const id = sha(canonicalUrl(feedUrl)).slice(0, 32);
  await db.collection("discoverySources").doc(id).set({
    name, type: "rss", platform: "RSS", category: "Community", feedUrl,
    enabled: true, autoPublish: request.data?.autoPublish !== false,
    createdAt: SERVER_TIME(), updatedAt: SERVER_TIME()
  }, { merge: true });
  return { id, name, feedUrl, autoPublish: request.data?.autoPublish !== false };
});
exports.setDiscoverySourceEnabled = onCall({ enforceAppCheck: false }, async request => {
  requireAdmin(request);
  const id = String(request.data?.id || "");
  if (!/^[a-f0-9]{32}$/.test(id)) throw new HttpsError("invalid-argument", "Invalid source ID.");
  await db.collection("discoverySources").doc(id).update({ enabled: Boolean(request.data?.enabled), updatedAt: SERVER_TIME() });
  return { id, enabled: Boolean(request.data?.enabled) };
});
exports.socialConnectorStatus = onCall({ enforceAppCheck: false }, async request => {
  requireAdmin(request);
  return { rss: "available", youtube: "available when HACKVERSE_YOUTUBE_API_KEY is configured", reddit: "requires approved Reddit OAuth application", x: "requires X API access and bearer token", linkedin: "no general public-post search integration", instagram: "no general public-content search integration", facebook: "requires eligible Meta app permissions", discord: "requires a bot invited to selected servers", telegram: "requires a bot added to selected channels" };
});
}
