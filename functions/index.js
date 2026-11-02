const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineString } = require("firebase-functions/params");
const logger = process.env.HACKVERSE_STANDALONE === "1"
  ? { warn: (...args) => console.warn(...args), error: (...args) => console.error(...args) }
  : require("firebase-functions/logger");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const Parser = require("rss-parser");
const crypto = require("node:crypto");

if (!getApps().length) initializeApp();
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
const OPENHPI_COURSE_FEED = process.env.HACKVERSE_STANDALONE === "1"
  ? { value: () => process.env.HACKVERSE_OPENHPI_COURSE_FEED || "https://open.hpi.de/feeds/courses" }
  : defineString("HACKVERSE_OPENHPI_COURSE_FEED", { default: "https://open.hpi.de/feeds/courses" });
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
    /(?:registration|application|submission)?\s*deadline\s*[:\-–]?\s*(20\d{2}-\d{2}-\d{2})/i,
    /registration\s+closes?\s+([A-Za-z]{3},?\s+\d{1,2}\s+[A-Za-z]{3,9}\s+20\d{2}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s+GMT)?)/i
  ];
  for (const re of patterns) {
    const match = source.match(re);
    if (match) { const date = new Date(match[1]); if (!Number.isNaN(date.getTime())) return date; }
  }
  return null;
}
function classify(text, sourceCategories = []) {
  const value = String(text || "").toLowerCase();
  const categories = (Array.isArray(sourceCategories) ? sourceCategories : [sourceCategories]).map(x => String(x || "").toLowerCase()).join(" ");
  if (/\bhackathon\b|\bhack-a-thon\b/.test(`${value} ${categories}`)) return { relevant: true, category: "hackathon", score: 95 };
  if (/boot\s?camp|developer intensive|coding intensive/.test(value)) return { relevant: true, category: "bootcamp", score: 88 };
  if (/professional certification|certification exam|certificate programme|certificate program|certification course/.test(value)) return { relevant: true, category: "certification", score: 86 };
  if (/online course|self[- ]paced course|course enrollment|course enrolment|learning path|massive open online course|\bmooc\b/.test(value)) return { relevant: true, category: "course", score: 85 };
  if (/case\s?(study|competition|challenge)|business case/.test(value) || /case study/.test(categories)) return { relevant: true, category: "case-competition", score: 84 };
  if (/coding contest|programming contest|code jam|coding challenge|\bctf\b|capture the flag|algorithm contest|developer challenge|open source sprint/.test(value) || /\bcoding\b|\bcontest\b/.test(categories) && /code|program|developer|software|algorithm|security/.test(value)) return { relevant: true, category: "coding-event", score: 82 };
  const weak = /\bhack\b.{0,30}\b(build|event|challenge|competition)\b/.test(value);
  return { relevant: weak, category: weak ? "hackathon" : "", score: weak ? 65 : 0 };
}
function extractOrganizer(text, fallback) {
  const match = String(text || "").match(/^\s*([^·\-]{2,100})\s*·\s*via\s+/i);
  return cleanText(match ? match[1] : fallback || "Source publisher", 120);
}
function extractPrize(text) {
  const match = String(text || "").match(/(?:Prize|Prize pool|Rewards?)\s*:\s*([^·\n\r]+?)(?=\s+-\s+|$)/i);
  return match ? cleanText(match[1], 100) : "";
}
function extractTeam(text) {
  const match = String(text || "").match(/(?:team(?:\s*size)?|team size)\s*:\s*([\w\s–-]{1,20})/i);
  return match ? cleanText(match[1], 30) : "";
}
function extractMode(text) {
  const value = String(text || "").toLowerCase();
  if (/\bhybrid\b/.test(value)) return "Hybrid";
  if (/\bonline\b|\bvirtual\b|\bremote\b/.test(value)) return "Online";
  if (/in person:|in-person|offline|on[- ]site/.test(value)) return "In-person";
  return null;
}
function extractLocation(text, source) {
  const match = String(text || "").match(/(?:in person|in-person|venue)\s*:\s*([^·\-]+?)(?=\s+-\s+|$)/i);
  const location = match ? cleanText(match[1], 120) : "";
  const sourceUrl = String(source.feedUrl || "");
  const india = /\/in\//i.test(sourceUrl) || /\bIndia\b|₹|INR/i.test(text);
  const parts = location.split(",").map(x => x.trim()).filter(Boolean);
  const city = parts[0] || "";
  const indianCityRegions = [
    ["Punjab", /\b(ludhiana|jalandhar|amritsar|patiala|bathinda|mohali)\b/i],
    ["Haryana", /\b(gurugram|gurgaon|faridabad|rohtak|panipat|sonipat)\b/i],
    ["Delhi NCR", /\b(new delhi|delhi|noida|ghaziabad)\b/i],
    ["West Bengal", /\b(kolkata|durgapur|siliguri)\b/i],
    ["Maharashtra", /\b(mumbai|pune|nagpur|nashik|aurangabad)\b/i],
    ["Karnataka", /\b(bengaluru|bangalore|mysuru|mangalore)\b/i],
    ["Telangana", /\b(hyderabad|warangal)\b/i],
    ["Tamil Nadu", /\b(chennai|coimbatore|madurai|tiruchirappalli)\b/i],
    ["Uttar Pradesh", /\b(lucknow|kanpur|varanasi|agra|prayagraj|allahabad)\b/i],
    ["Rajasthan", /\b(jaipur|jodhpur|udaipur|kota)\b/i],
    ["Gujarat", /\b(ahmedabad|surat|vadodara|rajkot)\b/i],
    ["Kerala", /\b(kochi|cochin|thiruvananthapuram|trivandrum|kozhikode)\b/i],
    ["Madhya Pradesh", /\b(bhopal|indore|gwalior|jabalpur)\b/i],
    ["Assam", /\b(guwahati|dibrugarh)\b/i],
    ["Odisha", /\b(bhubaneswar|cuttack)\b/i],
    ["Chandigarh", /\b(chandigarh)\b/i]
  ];
  const region = /delhi-ncr/i.test(sourceUrl) ? "Delhi NCR" :
    (parts.length > 1 && !/^india$/i.test(parts[1]) ? parts[1] :
      (india ? (indianCityRegions.find(([, re]) => re.test(location))?.[0] || "") : ""));
  const country = india ? "India" : (parts.length > 2 ? parts[parts.length - 1] : (/\bonline\b/i.test(text) ? "Global / Online" : ""));
  return { location, city, region, country };
}

function extractTags(text) {
  const vocab = ["AI / ML", "Web3", "Blockchain", "Climate", "Fintech", "Healthcare", "Education", "Gaming", "Cybersecurity", "Open innovation", "Robotics", "Data science", "Developer tools"];
  const lower = String(text || "").toLowerCase();
  return vocab.filter(tag => lower.includes(tag.toLowerCase().replace(" / ", " ")) || lower.includes(tag.toLowerCase())).slice(0, 8);
}
function parseCandidate(item, source) {
  const title = cleanText(item.title, 180);
  const summary = cleanText(item.contentSnippet || item.summary || item.contentEncoded || item.content || item.description || "", 1600);
  const categories = item.categories || item.category || [];
  const sourceHint = String(source.feedUrl || "");
  const categoryHints = [...(Array.isArray(categories) ? categories : [categories])];
  if (/coding-contests/i.test(sourceHint)) categoryHints.push("coding contest");
  if (/case-competitions/i.test(sourceHint)) categoryHints.push("case competition");
  if (/bootcamps/i.test(sourceHint)) categoryHints.push("bootcamp");
  if (/certifications/i.test(sourceHint)) categoryHints.push("certification course");
  if (/online-courses|courses/i.test(sourceHint)) categoryHints.push("online course");
  const text = `${title} ${summary} ${categoryHints.join(" ")}`;
  const relevance = classify(text, categoryHints);
  const sourceUrl = canonicalUrl(item.link || item.url || "");
  if (!title || !sourceUrl || !relevance.relevant) return null;
  const deadline = extractDeadline(text);
  const now = new Date();
  const expired = deadline && deadline.getTime() < now.getTime();
  const id = sha(sourceUrl).slice(0, 40);
  const titleKey = sha(title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()).slice(0, 40);
  const organizerFallback = item.creator || item.author || source.organizer || source.name || "Source publisher";
  const prize = extractPrize(text);
  const location = extractLocation(text, source);
  const mode = extractMode(text);
  const prizeMatch = prize.match(/(?:₹\s*|INR\s*)([\d,.]+)\s*(K|L|M)?/i);
  let prizePool = null;
  if (prizeMatch) {
    const base = Number(prizeMatch[1].replace(/,/g,""));
    const multiplier = ({K:1000,L:100000,M:1000000}[(prizeMatch[2]||"").toUpperCase()] || 1);
    if (Number.isFinite(base)) prizePool = base * multiplier;
  }
  const feeText = `${summary} ${item.title || ""}`.toLowerCase();
  const isFree = /\bfree\b/.test(feeText) ? true : (/paid entry|entry fee|registration fee/.test(feeText) ? false : null);
  const sourceHost = (() => { try { return new URL(source.feedUrl || sourceUrl).hostname; } catch { return ""; } })();
  const sourceName = cleanText(source.name || (sourceHost === "brabble.ai" ? "Brabble.ai" : sourceHost || "RSS publisher"), 120);
  return {
    id, titleKey, title, category: relevance.category, opportunityType: relevance.category,
    organizer: extractOrganizer(summary, organizerFallback),
    summary: summary || "An opportunity announcement was discovered by HackVerse. Visit the source for complete details.",
    description: summary || "Open the original listing for details.",
    sourceUrl, officialEventUrl: null, officialRegistrationUrl: null,
    registrationDeadline: deadline ? Timestamp.fromDate(deadline) : null,
    startAt: null, endAt: null, timezone: null, mode,
    location: location.location, city: location.city, region: location.region, country: location.country,
    tracks: extractTags(text), technologies: [], tags: extractTags(text), skills: [],
    level: /beginner|introductory/i.test(text) ? "Beginner" : (/advanced|expert/i.test(text) ? "Advanced" : "Open to all"),
    teamSize: extractTeam(text), prize, prizePool, currency: prizePool ? "INR" : null,
    isFree, price: isFree === true ? "Free" : (isFree === false ? "Paid" : ""),
    eligibility: "", sourcePlatform: source.platform || (sourceHost === "brabble.ai" ? "Brabble aggregated sources" : "RSS"),
    sourceType: relevance.category, sourceName,
    attributionText: sourceHost === "brabble.ai" ? "Aggregated by Brabble.ai · Follow the source link to the organiser" : `Discovered via ${sourceName}`,
    verificationStatus: "source-attributed", status: expired ? "expired" : "upcoming",
    visibility: source.autoPublish === false ? "moderation" : "public",
    autoPublished: source.autoPublish !== false, discoveryScore: relevance.score,
    sourcePublishedAt: (() => { const d = item.isoDate || item.pubDate ? new Date(item.isoDate || item.pubDate) : null; return d && !Number.isNaN(d.getTime()) ? d : null; })(),
    ingestedAt: SERVER_TIME(), updatedAt: SERVER_TIME(), lastSeenAt: SERVER_TIME(), sourceIds: [source.id]
  };
}

function isDuplicateCandidate(data) {
  // Publish only classified developer-learning or technology competition listings with secure HTTPS source links.
  return Boolean(data && data.title && data.sourceUrl && data.discoveryScore >= 65 && ["hackathon","coding-event","case-competition","bootcamp","course","certification"].includes(data.category));
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
async function ingestOpenHpiCourses(summary) {
  const feedUrl = safeHttps(OPENHPI_COURSE_FEED.value().trim());
  if (!feedUrl) return;
  summary.sourceCount += 1;
  try {
    const response = await fetch(feedUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`openHPI course feed returned HTTP ${response.status}`);
    const payload = await response.json();
    const courses = Array.isArray(payload.courses) ? payload.courses.slice(0, 2500) : [];
    summary.fetched += courses.length;
    const now = Date.now();
    for (const course of courses) {
      if (course.published === false) continue;
      const url = canonicalUrl(course.url || "");
      const title = cleanText(course.title, 180);
      if (!url || !title) continue;
      const start = course.start_date ? new Date(course.start_date) : null;
      const end = course.end_date ? new Date(course.end_date) : null;
      const validStart = start && !Number.isNaN(start.getTime()) ? start : null;
      const validEnd = end && !Number.isNaN(end.getTime()) ? end : null;
      // The catalogue includes historical courses. Only ingest dated courses that have
      // not ended, and skip undated items because their current enrolment status is unknown.
      if (!validStart && !validEnd) continue;
      if (validEnd && validEnd.getTime() < now) continue;
      if (!validEnd && validStart && validStart.getTime() < now) continue;
      const categories = Array.isArray(course.categories) ? course.categories.map(x => cleanText(x, 60)).filter(Boolean) : [];
      const description = cleanText(course.description || course.abstract || "", 2200);
      const abstract = cleanText(course.abstract || description, 1400);
      const id = sha(url).slice(0, 40);
      const titleKey = sha(title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()).slice(0, 40);
      const candidate = {
        id, titleKey, title, category: "course", opportunityType: "course",
        organizer: "Hasso Plattner Institute / openHPI", summary: abstract || "Online course listing from openHPI.",
        description: description || abstract || "Open the provider's course page for the current syllabus and enrolment details.",
        sourceUrl: url, officialEventUrl: url, officialRegistrationUrl: url,
        registrationDeadline: null,
        startAt: validStart ? Timestamp.fromDate(validStart) : null,
        endAt: validEnd ? Timestamp.fromDate(validEnd) : null,
        timezone: "UTC", mode: "Online", location: "Online", city: "", region: "", country: "Global / Online",
        tracks: categories, technologies: [], tags: categories, skills: categories,
        level: "Open to all", teamSize: "", prize: "", prizePool: null, currency: null,
        isFree: null, price: "Check provider",
        eligibility: "Check the provider's course page", courseLanguage: cleanText(course.language || "", 40),
        courseInstructor: cleanText(course.teacher || "", 160), courseProvider: "openHPI",
        sourcePlatform: "openHPI", sourceType: "course", sourceName: "openHPI",
        attributionText: "Course information from the official openHPI public course feed",
        verificationStatus: "source-attributed", status: "upcoming", visibility: "public", autoPublished: true,
        discoveryScore: 85, sourcePublishedAt: null, ingestedAt: SERVER_TIME(), updatedAt: SERVER_TIME(),
        lastSeenAt: SERVER_TIME(), sourceIds: ["openhpi-public-course-feed"]
      };
      summary.relevant++;
      await storeCandidate(candidate);
      summary.published++;
    }
  } catch (error) {
    summary.errors.push({ source: "openHPI course catalogue", message: String(error.message || error).slice(0, 180) });
    logger.warn("openHPI course ingestion failed", { error: error.message });
  }
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
  const [deadlineSnap, courseEndSnap] = await Promise.all([
    db.collection("hackathons").where("registrationDeadline", "<=", now).limit(350).get(),
    db.collection("hackathons").where("endAt", "<=", now).limit(350).get()
  ]);
  const dueByDeadline = deadlineSnap.docs.filter(doc => doc.data().visibility === "public" && doc.data().status !== "expired");
  const courseCategories = new Set(["course", "bootcamp", "certification"]);
  const dueByEnd = courseEndSnap.docs.filter(doc => doc.data().visibility === "public" && doc.data().status !== "expired" && courseCategories.has(doc.data().category));
  const dueMap = new Map([...dueByDeadline, ...dueByEnd].map(item => [item.id, item]));
  const due = [...dueMap.values()];
  if (!due.length) return 0;
  const batch = db.batch();
  due.forEach(item => batch.set(item.ref, { status: "expired", expiredAt: SERVER_TIME(), updatedAt: SERVER_TIME() }, { merge: true }));
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
    await ingestOpenHpiCourses(summary);
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
    .then(result => { console.log("HackVerse discovery result:"); console.log(JSON.stringify(result, null, 2)); if (result.errors?.length) process.exitCode = 1; })
    .catch(error => { console.error("HackVerse discovery failed:", error); process.exitCode = 1; });
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
