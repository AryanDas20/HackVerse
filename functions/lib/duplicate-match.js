function normalizeIdentity(value) {
  return String(value || "").toLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function millis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function reliableOrganizer(record) {
  const organizer = normalizeIdentity(record?.organizer);
  if (!organizer) return "";
  const source = normalizeIdentity(record?.sourceName || record?.sourcePlatform);
  const generic = new Set(["source publisher", "organiser not listed", "organizer not listed", "unknown"]);
  if (generic.has(organizer) || organizer === source) return "";
  return organizer;
}

function sameDate(a, b) {
  const left = millis(a), right = millis(b);
  return left !== null && right !== null && Math.abs(left - right) <= 72 * 60 * 60 * 1000;
}

function sameLocation(a, b) {
  const left = normalizeIdentity(a), right = normalizeIdentity(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left === "online" && right === "online") return true;
  if (left === "online" || right === "online") return false;
  return left.includes(right) || right.includes(left);
}

// A title by itself is not enough: annual events and unrelated events often reuse names.
// Without an exact canonical URL, require the exact normalized title plus either a
// reliable organiser match or both a close date match and a location match.
function isSafeTitleDuplicate(candidate, existing) {
  if (!candidate || !existing || candidate.category !== existing.category) return false;
  const titleA = normalizeIdentity(candidate.title);
  const titleB = normalizeIdentity(existing.title);
  if (!titleA || titleA !== titleB) return false;

  const orgA = reliableOrganizer(candidate);
  const orgB = reliableOrganizer(existing);
  if (orgA && orgB && orgA === orgB) return true;

  const dates = ["registrationDeadline", "startAt", "endAt"];
  const dateMatches = dates.some(key => sameDate(candidate[key], existing[key]));
  return dateMatches && sameLocation(candidate.location || candidate.city, existing.location || existing.city);
}

module.exports = { normalizeIdentity, isSafeTitleDuplicate };
