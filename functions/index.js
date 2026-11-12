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
const { resolveEventId } = require("./lib/event-id");
const { cleanText } = require("./lib/clean-text");
const { findListingArray } = require("./lib/listing-array");
const { isSafeTitleDuplicate } = require("./lib/duplicate-match");
const { extractDeadline } = require("./lib/deadline");
const { OPPORTUNITY_CATEGORIES, classifyOpportunity } = require("./lib/opportunity-category");

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
const BRABBLE_API_KEY = process.env.HACKVERSE_STANDALONE === "1"
  ? { value: () => process.env.HACKVERSE_BRABBLE_API_KEY || "" }
  : defineString("HACKVERSE_BRABBLE_API_KEY", { default: "" });
const SERVER_TIME = FieldValue.serverTimestamp;

function sha(value) { return crypto.createHash("sha256").update(String(value)).digest("hex"); }

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
function classify(text, sourceCategories = []) {
  return classifyOpportunity(text, sourceCategories);
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
  const country = india ? "India" : (parts.length > 2 ? parts[parts.length - 1] : "");
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
  if (OPPORTUNITY_CATEGORIES.has(String(source.category || "").toLowerCase())) categoryHints.push(source.category);
  if (/coding-contests/i.test(sourceHint)) categoryHints.push("coding contest");
  if (/case-competitions/i.test(sourceHint)) categoryHints.push("case competition");
  if (/bootcamps/i.test(sourceHint)) categoryHints.push("bootcamp");
  if (/certifications/i.test(sourceHint)) categoryHints.push("certification course");
  if (/online-courses|courses/i.test(sourceHint)) categoryHints.push("online course");
  if (/internships/i.test(sourceHint)) categoryHints.push("internship");
  if (/scholarships/i.test(sourceHint)) categoryHints.push("scholarship");
  if (/fellowships/i.test(sourceHint)) categoryHints.push("fellowship");
  if (/grants/i.test(sourceHint)) categoryHints.push("grant");
  if (/research/i.test(sourceHint)) categoryHints.push("research opportunity");
  if (/competitions/i.test(sourceHint)) categoryHints.push("competition");
  const text = `${title} ${summary} ${categoryHints.join(" ")}`;
  const relevance = classify(text, categoryHints);
  const sourceUrl = canonicalUrl(item.link || item.url || "");
  if (!title || !sourceUrl || !relevance.relevant) return null;
  const deadline = extractDeadline(text);
  const now = new Date();
  const expired = deadline && deadline.getTime() < now.getTime();
  const id = sha(sourceUrl).slice(0, 40);
  const titleKey = sha(`${relevance.category}:${title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`).slice(0, 40);
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
  return Boolean(data && data.title && data.sourceUrl && data.discoveryScore >= 65 && ["hackathon","coding-event","case-competition","bootcamp","course","certification","internship","scholarship","fellowship","grant","research","competition","volunteering"].includes(data.category));
}
async function storeCandidate(candidate) {
  const fingerprints = db.collection("eventFingerprints");
  const events = db.collection("hackathons");
  const urlFingerprint = fingerprints.doc(sha(candidate.sourceUrl));
  const titleFingerprint = fingerprints.doc(`title_${candidate.titleKey}`);
  let eventId = candidate.id;

  await db.runTransaction(async tx => {
    const [urlSnap, titleSnap] = await Promise.all([
      tx.get(urlFingerprint),
      tx.get(titleFingerprint)
    ]);

    const urlEventId = urlSnap.exists ? urlSnap.data().eventId : null;
    const titleData = titleSnap.exists ? titleSnap.data() : {};
    const titleEventIds = [...new Set([
      ...(Array.isArray(titleData.eventIds) ? titleData.eventIds : []),
      titleData.eventId
    ].filter(Boolean))].slice(0, 25);
    const categoryEventId = sha(`${candidate.category}:${candidate.sourceUrl}`).slice(0, 40);
    const possibleIds = [...new Set([
      urlEventId, ...titleEventIds, candidate.id, categoryEventId
    ].filter(Boolean))];

    const possibleRefs = possibleIds.map(id => events.doc(id));
    const possibleSnaps = await Promise.all(possibleRefs.map(ref => tx.get(ref)));
    const snapshotsById = new Map(possibleIds.map((id, i) => [id, possibleSnaps[i]]));
    const categoriesById = Object.fromEntries(possibleIds.flatMap((id, i) =>
      possibleSnaps[i].exists ? [[id, possibleSnaps[i].data().category]] : []
    ));

    // URL fingerprints are exact identity. A title fingerprint is only a candidate:
    // confirm a second independent signal before merging records with different URLs.
    const safeTitleId = titleEventIds.find(id => {
      const snap = snapshotsById.get(id);
      return snap?.exists && isSafeTitleDuplicate(candidate, snap.data());
    }) || null;

    eventId = resolveEventId({
      candidateCategory: candidate.category,
      candidateId: candidate.id,
      categoryEventId,
      urlEventId,
      titleEventId: safeTitleId,
      categoriesById
    });

    const eventRef = events.doc(eventId);
    const existing = snapshotsById.get(eventId);
    const wasDuplicate = Boolean(existing?.exists || safeTitleId);
    const previous = existing?.exists ? existing.data() : {};
    if (previous.category && previous.category !== candidate.category) {
      throw new Error("Refusing to merge an event from a different category.");
    }

    const sources = [...new Set([
      ...(previous.sourceIds || []),
      ...(candidate.sourceIds || [])
    ])].slice(0, 20);
    const sourceRecord = {
      sourceId: (candidate.sourceIds || [])[0] || "unknown",
      sourceName: candidate.sourceName || candidate.sourcePlatform || "Unknown source",
      sourcePlatform: candidate.sourcePlatform || "",
      sourceUrl: candidate.sourceUrl,
      firstSeenAt: Timestamp.now()
    };
    const oldRecords = Array.isArray(previous.sourceRecords) ? previous.sourceRecords : [];
    const priorSourceRecord = oldRecords.find(item =>
      item.sourceId === sourceRecord.sourceId && item.sourceUrl === sourceRecord.sourceUrl
    );
    const sourceRecords = [...oldRecords.filter(item =>
      !(item.sourceId === sourceRecord.sourceId && item.sourceUrl === sourceRecord.sourceUrl)
    ), priorSourceRecord || sourceRecord].slice(-25);

    const merged = {
      ...candidate,
      ...(previous.sourceUrl && !/brabble|aggregat/i.test(`${previous.sourceName || ""} ${previous.sourcePlatform || ""}`)
        ? { sourceUrl: previous.sourceUrl, sourceName: previous.sourceName, sourcePlatform: previous.sourcePlatform }
        : {}),
      ...(!candidate.registrationDeadline && previous.registrationDeadline
        ? { registrationDeadline: previous.registrationDeadline } : {}),
      ...(previous.officialRegistrationUrl
        ? { officialRegistrationUrl: previous.officialRegistrationUrl } : {}),
      ...(previous.startAt ? { startAt: previous.startAt } : {}),
      ...(previous.endAt ? { endAt: previous.endAt } : {}),
      ...(previous.mode ? { mode: previous.mode } : {}),
      sourceIds: sources,
      sourceRecords,
      firstSeenAt: previous.firstSeenAt || SERVER_TIME(),
      updatedAt: SERVER_TIME(),
      lastSeenAt: SERVER_TIME()
    };

    if (previous.organizerVerified === true) {
      merged.organizer = previous.organizer;
      merged.officialEventUrl = previous.officialEventUrl;
      merged.officialRegistrationUrl = previous.officialRegistrationUrl;
      merged.verificationStatus = previous.verificationStatus;
    }

    tx.set(eventRef, merged, { merge: true });
    tx.set(urlFingerprint, { eventId, updatedAt: SERVER_TIME() }, { merge: true });
    tx.set(titleFingerprint, {
      eventId,
      eventIds: [...new Set([...titleEventIds, eventId])].slice(-25),
      updatedAt: SERVER_TIME()
    }, { merge: true });
  });

  return { eventId, duplicate: wasDuplicate };
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

// Direct public listing connectors. These are independent of Brabble: each platform
// is fetched separately, so a failure at one provider does not stop the others.
const DIRECT_PLATFORM_SOURCES = [
  // Bounded pagination with repeat-page protection; providers that ignore page= stop safely.
  { id: "direct-unstop", name: "Unstop", platform: "Unstop", url: "https://unstop.com/api/public/opportunity/search-result?opportunity=hackathons&per_page=100&oppstatus=open", parser: "unstop", maxPages: 8 },
  { id: "direct-devpost", name: "Devpost", platform: "Devpost", url: "https://devpost.com/api/hackathons", parser: "devpost", maxPages: 5 },
  { id: "direct-devfolio", name: "Devfolio", platform: "Devfolio", url: "https://api.devfolio.co/api/hackathons?page=1", parser: "generic", maxPages: 5 },
  { id: "direct-hackerearth", name: "HackerEarth", platform: "HackerEarth", url: "https://www.hackerearth.com/chrome-extension/events/", parser: "generic", maxPages: 1 }
];
function firstValue(...values) { return values.find(v => v !== undefined && v !== null && v !== ""); }
function directListingCandidate(platform, item, diagnostics = null) {
  const org = firstValue(item.organisation?.name, item.organization?.name, item.organizer?.name,
    item.organizer, item.company?.name, item.company, item.host, item.creator, platform.name);
  const title = cleanText(firstValue(item.title, item.name, item.hackathon_name, item.event_name), 180);
  const description = cleanText(firstValue(item.details, item.description, item.summary, item.about, item.tagline, item.desc), 1800);
  let link = platform.platform.toLowerCase() === "devfolio"
    ? firstValue(item.hackathon_setting?.site, item.slug ? `https://${item.slug}.devfolio.co/` : null, item.seo_url, item.url, item.link, item.public_url, item.short_url, item.event_url, item.href)
    : firstValue(item.seo_url, item.url, item.link, item.public_url, item.short_url, item.event_url, item.href);
  if (link && !/^https:\/\//i.test(link)) link = `https://${platform.platform.toLowerCase() === "unstop" ? "unstop.com" : platform.platform.toLowerCase() === "devpost" ? "devpost.com" : platform.platform.toLowerCase() === "devfolio" ? "devfolio.co" : "hackerearth.com"}/${String(link).replace(/^\//, "")}`;
  const sourceUrl = canonicalUrl(link || "");
  if (!title) { diagnostics && (diagnostics.missingTitle = (diagnostics.missingTitle || 0) + 1); return null; }
  if (!sourceUrl) { diagnostics && (diagnostics.missingUrl = (diagnostics.missingUrl || 0) + 1); return null; }

  const req = item.regnRequirements || item.registration || item.registration_details || {};
  const deadlineRaw = firstValue(req.end_regn_dt, req.deadline, item.registration_deadline, item.deadline,
    item.submission_period_dates?.end, item.hackathon_setting?.reg_ends_at);
  const startRaw = firstValue(item.start_tz, item.start_timestamp, item.start_date, item.startDate, item.starts_at, item.start_at,
    item.submission_period_dates?.start, item.festival?.start_date);
  const endRaw = firstValue(item.end_tz, item.end_timestamp, item.end_date, item.endDate, item.ends_at, item.end_at,
    item.festival?.end_date);
  const parseDate = value => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date : null; };
  const deadline = parseDate(deadlineRaw);
  const startAt = parseDate(startRaw);
  const endAt = parseDate(endRaw);
  if (deadline && deadline.getTime() < Date.now()) { diagnostics && (diagnostics.expiredDeadline = (diagnostics.expiredDeadline || 0) + 1); return null; }
  if (endAt && endAt.getTime() < Date.now()) { diagnostics && (diagnostics.expiredEnd = (diagnostics.expiredEnd || 0) + 1); return null; }

  const address = item.address_with_country_logo || item.address || item.location || {};
  const countryValue = firstValue(
    address.country?.name,
    address.country_name,
    typeof item.country === "object" && item.country !== null ? item.country.name : item.country,
    item.country_name
  );
  const country = cleanText(
    typeof countryValue === "string" || typeof countryValue === "number" ? countryValue : "",
    80
  );
  const city = cleanText(firstValue(address.city, item.city, item.location?.city), 100);
  const region = cleanText(firstValue(address.state, item.state, item.location?.state), 100);
  const modeRaw = String(firstValue(item.region, item.mode, item.format, item.event_mode, "") || "").toLowerCase();
  const mode = /hybrid/.test(modeRaw) ? "Hybrid" : /online|virtual|remote/.test(modeRaw) ? "Online" : /offline|in.?person|onsite/.test(modeRaw) ? "In-person" : (item.is_online === true ? "Online" : null);
  const skills = (Array.isArray(item.required_skills) ? item.required_skills : Array.isArray(item.skills) ? item.skills : [])
    .map(skill => cleanText(skill.skill_name || skill.name || skill.skill || skill, 60)).filter(Boolean).slice(0, 12);
  const prizeRows = Array.isArray(item.prizes) ? item.prizes : [];
  const prize = prizeRows.map(row => [row.rank, row.cash, row.currencyCode || row.currency].filter(Boolean).join(" ")).filter(Boolean).join("; ").slice(0, 200);
  const devfolioPaid = item.hackathon_setting?.paid;
  const isFree = devfolioPaid === false || item.isPaid === false || item.is_paid === false
    ? true
    : devfolioPaid === true || item.isPaid === true || item.is_paid === true
      ? false
      : null;
  const text = `${title} ${description}`;
  const titleKey = sha(`hackathon:${title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`).slice(0, 40);
  const id = sha(sourceUrl).slice(0, 40);
  const expired = deadline && deadline.getTime() < Date.now();
  return {
    id, titleKey, title, category: "hackathon", opportunityType: "hackathon", organizer: cleanText(org, 120),
    summary: description || `Hackathon listing published on ${platform.name}.`,
    description: description || `Open the original ${platform.name} listing for rules, dates and registration details.`,
    sourceUrl, officialEventUrl: sourceUrl, officialRegistrationUrl: sourceUrl,
    registrationDeadline: deadline ? Timestamp.fromDate(deadline) : null,
    startAt: startAt ? Timestamp.fromDate(startAt) : null, endAt: endAt ? Timestamp.fromDate(endAt) : null,
    timezone: null, mode, location: [city, region, country].filter(Boolean).join(", "), city, region, country,
    tracks: skills, technologies: skills, tags: skills, skills,
    level: "Check eligibility on provider site", teamSize: cleanText(firstValue(req.max_team_size, item.team_size, item.team), 40),
    prize, prizePool: null, currency: null, isFree, price: isFree === true ? "Free" : isFree === false ? "Paid" : "Check provider",
    eligibility: cleanText(firstValue(item.eligibility, item.eligibility_text, item.eligibility_criteria, "Check the organiser's eligibility rules"), 500),
    eligibleCountries: Array.isArray(item.eligible_countries) ? item.eligible_countries.map(v => cleanText(v?.name || v, 80)).filter(Boolean).slice(0, 50) : [],
    isWorldwide: item.is_worldwide === true || item.worldwide === true,
    sourcePlatform: platform.platform, sourceType: "hackathon", sourceName: platform.name,
    attributionText: `Listing imported directly from ${platform.name}; confirm details on the organiser's page.`,
    verificationStatus: "source-attributed", status: expired ? "expired" : "upcoming", visibility: "public", autoPublished: true,
    discoveryScore: 96, sourcePublishedAt: parseDate(firstValue(item.updated_at, item.created_at, item.published_at)),
    ingestedAt: SERVER_TIME(), updatedAt: SERVER_TIME(), lastSeenAt: SERVER_TIME(), sourceIds: [platform.id]
  };
}
function directPageIdentity(row) {
  return String(firstValue(row.id, row.uuid, row.slug, row.url, row.link, row.public_url,
    `${row.title || row.name || row.hackathon_name || ""}:${row.organizer?.name || row.organizer || row.organisation?.name || ""}:${row.start_date || row.start_at || row.starts_at || row.deadline || ""}`) || "");
}
async function fetchDirectPlatform(platform) {
  const collected = [], seenRows = new Set(), seenPages = new Set();
  const pageCount = Math.max(1, Math.min(Number(platform.maxPages) || 1, 10));
  for (let page = 1; page <= pageCount; page++) {
    const endpoint = new URL(platform.url);
    if (platform.maxPages > 1) endpoint.searchParams.set("page", String(page));
    const response = await fetch(endpoint, {
      headers: { "Accept": "application/json, text/plain, */*", "User-Agent": "Mozilla/5.0 (compatible; HackVerseDiscovery/1.0)" },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) {
      if (page === 1) throw new Error(`HTTP ${response.status} on page ${page}`);
      break;
    }
    const body = await response.json();
    let rows;
    if (platform.parser === "unstop") {
      rows = body?.data?.data;
      if (!Array.isArray(rows)) throw new Error("Unstop response format changed; expected data.data array");
    } else {
      rows = findListingArray(body);
      if (!rows.length && page === 1) throw new Error("No listing array found in provider response");
    }
    if (!rows.length) break;
    const fingerprint = sha(rows.map(directPageIdentity).join("|"));
    if (seenPages.has(fingerprint)) break;
    seenPages.add(fingerprint);
    let added = 0;
    for (const row of rows) {
      const identity = directPageIdentity(row);
      if (identity && seenRows.has(identity)) continue;
      if (identity) seenRows.add(identity);
      collected.push(row); added++;
    }
    if (added === 0) break;
    if (platform.parser === "unstop" && rows.length < 100) break;
  }
  return collected;
}
async function ingestDirectPlatforms(summary) {
  for (const platform of DIRECT_PLATFORM_SOURCES) {
    summary.sourceCount++;
    try {
      const rows = await fetchDirectPlatform(platform);
      summary.fetched += rows.length;
      let published = 0;
      const diagnostics = { missingTitle: 0, missingUrl: 0, expiredDeadline: 0, expiredEnd: 0, rejectedQuality: 0, duplicates: 0 };
      for (const row of rows) {
        const candidate = directListingCandidate(platform, row, diagnostics);
        if (!candidate) continue;
        if (!isDuplicateCandidate(candidate)) { diagnostics.rejectedQuality++; continue; }
        summary.relevant++;
        const stored = await storeCandidate(candidate);
        if (stored.duplicate) { summary.duplicates++; diagnostics.duplicates++; }
        summary.published++; published++;
      }
      await db.collection("discoverySources").doc(platform.id).set({
        name: platform.name, platform: platform.platform, type: "direct-api", enabled: true,
        lastRunAt: SERVER_TIME(), lastError: null, lastItemCount: rows.length, lastPublishedCount: published,
        sourceUrl: platform.url, maxPages: platform.maxPages || 1, diagnostics, updatedAt: SERVER_TIME()
      }, { merge: true });
      console.log(`[direct:${platform.name}] fetched=${rows.length} published=${published} skipped=${JSON.stringify(diagnostics)}`);
    } catch (error) {
      const message = String(error.message || error).slice(0, 220);
      summary.errors.push({ source: platform.name, message });
      await db.collection("discoverySources").doc(platform.id).set({
        name: platform.name, platform: platform.platform, type: "direct-api", enabled: true,
        lastRunAt: SERVER_TIME(), lastError: message, sourceUrl: platform.url, updatedAt: SERVER_TIME()
      }, { merge: true }).catch(() => {});
      logger.warn(`Direct ${platform.name} ingestion failed`, { error: message });
    }
  }
}


// Optional Brabble aggregator API. The API key is read only in the discovery runner,
// never exposed to the browser. Pages are cached in Firestore and source attribution
// is retained on each listing; registrations still point to the organiser's URL.
async function ingestBrabbleListings(summary) {
  const apiKey = BRABBLE_API_KEY.value().trim();
  const sourceId = "brabble-aggregator-api";
  summary.sourceCount += 1;
  if (!apiKey) {
    await db.collection("discoverySources").doc(sourceId).set({
      name: "Brabble.ai Aggregator (hackathons hub)", platform: "Brabble.ai", type: "api", enabled: true,
      sourceUrl: "https://brabble.ai/api/listings?hub=hackathons", lastRunAt: SERVER_TIME(),
      lastError: "Missing HACKVERSE_BRABBLE_API_KEY GitHub Actions secret", updatedAt: SERVER_TIME()
    }, { merge: true }).catch(() => {});
    return;
  }
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;
  let fetchedCount = 0;
  let published = 0;
  try {
    const maxRowsPerRun = 1000; // five 200-row pages; below the provider's 1,000-request/day free quota.
    while (offset < total && offset < maxRowsPerRun) {
      const endpoint = new URL("https://brabble.ai/api/listings");
      endpoint.search = new URLSearchParams({ hub: "hackathons", limit: "200", offset: String(offset) }).toString();
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) {
        let detail = "";
        try { detail = (await response.json()).error || ""; } catch {}
        throw new Error(`Brabble API returned HTTP ${response.status}${detail ? `: ${cleanText(detail, 140)}` : ""}`);
      }
      const payload = await response.json();
      if (!Array.isArray(payload.listings)) throw new Error("Brabble API response did not contain a listings array.");
      total = Number(payload.total || 0);
      const rows = payload.listings;
      summary.fetched += rows.length;
      fetchedCount += rows.length;
      for (const row of rows) {
        const title = cleanText(row.title, 180);
        const sourceUrl = canonicalUrl(row.url || "");
        const deadlineDate = row.deadline ? new Date(row.deadline) : null;
        const validDeadline = deadlineDate && !Number.isNaN(deadlineDate.getTime()) ? deadlineDate : null;
        // Some valid listings do not publish a deadline. Keep them visible as
        // deadline-unspecified rather than silently discarding them.
        if (!title || !sourceUrl || (validDeadline && validDeadline.getTime() < Date.now())) continue;
        const rawType = String(row.type || "").trim().toUpperCase();
        const category = rawType === "HACKATHON" ? "hackathon"
          : rawType === "CASE STUDY" ? "case-competition"
          : ["CONTEST", "CODING"].includes(rawType) ? "coding-event"
          : "case-competition";
        const kind = String(row.kind || "competition").toLowerCase();
        const deadlineIsStart = kind === "contest";
        const organizer = cleanText(row.organiser || row.organizer || row.platform || "Organiser not listed", 120);
        const platform = cleanText(row.platform || "Brabble source", 80);
        const city = cleanText(row.city || "", 100);
        const modeRaw = String(row.mode || "").toUpperCase();
        const mode = modeRaw === "ONLINE" ? "Online" : modeRaw === "OFFLINE" ? "In-person" : modeRaw === "HYBRID" ? "Hybrid" : null;
        const fee = cleanText(row.fee || "", 80);
        const prizeLabel = cleanText(row.prize?.label || "", 120);
        const prizePool = Number.isFinite(Number(row.prize?.inr)) ? Number(row.prize.inr) : null;
        const eligibilityRows = Array.isArray(row.eligibility) ? row.eligibility.map(x => cleanText(x, 180)).filter(Boolean).slice(0, 12) : [];
        const eligibility = eligibilityRows.join("; ") || "Check the organiser's eligibility rules.";
        const tags = [platform, rawType, "Student opportunity"].filter(Boolean);
        const titleKey = sha(`${category}:${title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`).slice(0, 40);
        const shareUrl = canonicalUrl(row.shareUrl || "");
        const candidate = {
          id: sha(sourceUrl).slice(0, 40), titleKey, title, category, opportunityType: category,
          organizer, summary: `${rawType.replace(/_/g, " ") || "Opportunity"} listed on ${platform}. ${mode || "Format not specified"}${city && city !== "See listing" ? ` · ${city}` : ""}. Open the organiser page to confirm application details.`,
          description: `Discovered through Brabble.ai's aggregated opportunity index. Original organiser: ${organizer}. Platform: ${platform}. ${eligibility}`,
          sourceUrl, officialEventUrl: sourceUrl, officialRegistrationUrl: sourceUrl, brabbleShareUrl: shareUrl,
          registrationDeadline: deadlineIsStart || !validDeadline ? null : Timestamp.fromDate(validDeadline),
          startAt: deadlineIsStart && validDeadline ? Timestamp.fromDate(validDeadline) : null, endAt: null, timezone: null,
          mode, location: city && city !== "See listing" ? city : (mode === "Online" ? "Online" : "Location not listed"),
          city: city === "See listing" ? "" : city, region: "", country: "",
          tracks: tags, technologies: [], tags, skills: [], level: "Check organiser requirements",
          teamSize: cleanText(row.team || "", 40), prize: prizeLabel === "See listing" ? "" : prizeLabel,
          prizePool, currency: prizePool !== null ? "INR" : null,
          isFree: /^free$/i.test(fee) ? true : (fee ? false : null), price: fee || "Check organiser details",
          eligibility, eligibleCountries: [], isWorldwide: eligibilityRows.some(x => /worldwide|open to all|global/i.test(x)),
          sourcePlatform: platform, sourceType: category, sourceName: "Brabble.ai",
          attributionText: `Aggregated by Brabble.ai. ${payload.attribution || "See Brabble.ai and follow the original organiser link for details."}`,
          verificationStatus: "source-attributed", status: deadlineIsStart ? "upcoming" : "upcoming",
          visibility: "public", autoPublished: true, discoveryScore: 94,
          sourcePublishedAt: null, ingestedAt: SERVER_TIME(), updatedAt: SERVER_TIME(), lastSeenAt: SERVER_TIME(), sourceIds: [sourceId]
        };
        if (!isDuplicateCandidate(candidate)) continue;
        const stored = await storeCandidate(candidate);
        if (stored.duplicate) summary.duplicates++;
        summary.relevant++;
        summary.published++;
        published++;
      }
      offset += rows.length;
      if (!rows.length || rows.length < 200 || offset >= total) break;
    }
    await db.collection("discoverySources").doc(sourceId).set({
      name: "Brabble.ai Aggregator (hackathons hub)", platform: "Brabble.ai", type: "api", enabled: true,
      sourceUrl: "https://brabble.ai/api/listings?hub=hackathons", lastRunAt: SERVER_TIME(), lastError: null,
      lastItemCount: fetchedCount, lastPublishedCount: published, totalAvailable: total,
      maxRowsPerRun, updatedAt: SERVER_TIME()
    }, { merge: true });
  } catch (error) {
    const message = String(error.message || error).slice(0, 220);
    summary.errors.push({ source: "Brabble.ai API", message });
    await db.collection("discoverySources").doc(sourceId).set({
      name: "Brabble.ai Aggregator (hackathons hub)", platform: "Brabble.ai", type: "api", enabled: true,
      sourceUrl: "https://brabble.ai/api/listings?hub=hackathons", lastRunAt: SERVER_TIME(), lastError: message, updatedAt: SERVER_TIME()
    }, { merge: true }).catch(() => {});
    logger.warn("Brabble aggregator ingestion failed", { error: message });
  }
}

// Official public Codeforces contest API. It is read anonymously and queried only once
// per scheduled discovery run, respecting the provider's documented request rate.
async function ingestCodeforcesContests(summary) {
  summary.sourceCount += 1;
  const sourceId = "direct-codeforces-contests";
  try {
    const response = await fetch("https://codeforces.com/api/contest.list?gym=false", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`Codeforces API returned HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.status !== "OK" || !Array.isArray(payload.result)) {
      throw new Error(cleanText(payload.comment || "Unexpected Codeforces API response", 180));
    }
    const contests = payload.result;
    summary.fetched += contests.length;
    let published = 0;
    for (const contest of contests) {
      const phase = String(contest.phase || "").toUpperCase();
      if (!["BEFORE", "CODING"].includes(phase)) continue;
      const startMs = Number(contest.startTimeSeconds || 0) * 1000;
      const durationSeconds = Number(contest.durationSeconds || 0);
      if (!startMs || !durationSeconds) continue;
      const endMs = startMs + durationSeconds * 1000;
      if (endMs < Date.now()) continue;
      const title = cleanText(contest.name || `Codeforces contest ${contest.id}`, 180);
      const sourceUrl = canonicalUrl(`https://codeforces.com/contest/${encodeURIComponent(contest.id)}`);
      const category = "coding-event";
      const titleKey = sha(`${category}:${title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`).slice(0, 40);
      const candidate = {
        id: sha(sourceUrl).slice(0, 40), titleKey, title, category, opportunityType: category,
        organizer: "Codeforces", summary: "Public competitive-programming contest. Open the official contest page to confirm start time, participation rules and registration details.",
        description: cleanText(contest.description || "Competitive programming round hosted on Codeforces. Participation requirements and contest rules are published by the organiser.", 1800),
        sourceUrl, officialEventUrl: sourceUrl, officialRegistrationUrl: sourceUrl,
        registrationDeadline: null, startAt: Timestamp.fromDate(new Date(startMs)), endAt: Timestamp.fromDate(new Date(endMs)),
        timezone: "UTC", mode: "Online", location: "Online", city: "", region: "", country: "Global",
        tracks: ["Algorithms", "Competitive programming"], technologies: ["C++", "Python", "Java"], tags: ["Algorithms", "Competitive programming"], skills: ["Problem solving"],
        level: "Open to all", teamSize: "Individual", prize: "See official contest page", prizePool: null, currency: null,
        isFree: true, price: "Free", eligibility: "Check the official contest rules.", eligibleCountries: [], isWorldwide: true,
        sourcePlatform: "Codeforces", sourceType: category, sourceName: "Codeforces", attributionText: "Contest metadata imported from the official public Codeforces API; confirm details on Codeforces.",
        verificationStatus: "source-attributed", status: startMs > Date.now() ? "upcoming" : "ongoing", visibility: "public", autoPublished: true,
        discoveryScore: 90, sourcePublishedAt: null, ingestedAt: SERVER_TIME(), updatedAt: SERVER_TIME(), lastSeenAt: SERVER_TIME(), sourceIds: [sourceId]
      };
      if (!isDuplicateCandidate(candidate)) continue;
      const stored = await storeCandidate(candidate);
      if (stored.duplicate) summary.duplicates++;
      summary.relevant++;
      summary.published++;
      published++;
    }
    await db.collection("discoverySources").doc(sourceId).set({
      name: "Codeforces", platform: "Codeforces", type: "direct-api", enabled: true,
      sourceUrl: "https://codeforces.com/api/contest.list?gym=false", lastRunAt: SERVER_TIME(),
      lastError: null, lastItemCount: contests.length, lastPublishedCount: published, updatedAt: SERVER_TIME()
    }, { merge: true });
  } catch (error) {
    const message = String(error.message || error).slice(0, 220);
    summary.errors.push({ source: "Codeforces", message });
    await db.collection("discoverySources").doc(sourceId).set({
      name: "Codeforces", platform: "Codeforces", type: "direct-api", enabled: true,
      sourceUrl: "https://codeforces.com/api/contest.list?gym=false", lastRunAt: SERVER_TIME(), lastError: message, updatedAt: SERVER_TIME()
    }, { merge: true }).catch(() => {});
    logger.warn("Codeforces discovery failed", { error: message });
  }
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
      const titleKey = sha(`course:${title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`).slice(0, 40);
      const candidate = {
        id, titleKey, title, category: "course", opportunityType: "course",
        organizer: "Hasso Plattner Institute / openHPI", summary: abstract || "Online course listing from openHPI.",
        description: description || abstract || "Open the provider's course page for the current syllabus and enrolment details.",
        sourceUrl: url, officialEventUrl: url, officialRegistrationUrl: url,
        registrationDeadline: null,
        startAt: validStart ? Timestamp.fromDate(validStart) : null,
        endAt: validEnd ? Timestamp.fromDate(validEnd) : null,
        timezone: "UTC", mode: "Online", location: "Online", city: "", region: "", country: "",
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
      const stored = await storeCandidate(candidate);
      if (stored.duplicate) summary.duplicates++;
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
        const stored = await storeCandidate(candidate); if (stored.duplicate) summary.duplicates++;
        summary.published++;
      }
    } catch (error) {
      summary.errors.push({ source: `YouTube search: ${searchTerm}`, message: String(error.message || error).slice(0, 180) });
      logger.warn("YouTube discovery failed", { searchTerm, error: error.message });
    }
  }
}
async function expirePastDeadlines() {
  const now = Timestamp.now();
  const pageSize = 350;
  const dueMap = new Map();
  async function collectDue(field) {
    // A single query is intentionally bounded to keep each scheduled run cheap.
    // The next six-hour run continues cleanup if a collection contains more than the bound.
    const snap = await db.collection("hackathons").where(field, "<=", now).limit(pageSize).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.visibility === "public" && data.status !== "expired") dueMap.set(doc.id, doc);
    }
  }
  await Promise.all([collectDue("registrationDeadline"), collectDue("endAt")]);
  if (!dueMap.size) return 0;
  const docs = [...dueMap.values()];
  let expired = 0;
  for (let offset = 0; offset < docs.length; offset += 450) {
    const batch = db.batch();
    const chunk = docs.slice(offset, offset + 450);
    chunk.forEach(item => batch.set(item.ref, { status: "expired", expiredAt: SERVER_TIME(), updatedAt: SERVER_TIME() }, { merge: true }));
    await batch.commit();
    expired += chunk.length;
  }
  return expired;
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
          const stored = await storeCandidate(candidate); if (stored.duplicate) summary.duplicates++;
          summary.published++;
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
    await ingestDirectPlatforms(summary);
    await ingestBrabbleListings(summary);
    await ingestCodeforcesContests(summary);
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
  const requestedCategory = String(request.data?.category || "").trim().toLowerCase();
  const category = OPPORTUNITY_CATEGORIES.has(requestedCategory) ? requestedCategory : "Community";
  if (!name || !feedUrl) throw new HttpsError("invalid-argument", "Provide a source name and a valid HTTPS RSS feed URL.");
  const id = sha(canonicalUrl(feedUrl)).slice(0, 32);
  await db.collection("discoverySources").doc(id).set({
    name, type: "rss", platform: "RSS", category, feedUrl,
    enabled: true, autoPublish: request.data?.autoPublish !== false,
    createdAt: SERVER_TIME(), updatedAt: SERVER_TIME()
  }, { merge: true });
  return { id, name, feedUrl, category, autoPublish: request.data?.autoPublish !== false };
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
