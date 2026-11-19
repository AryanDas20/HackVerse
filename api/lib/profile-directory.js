const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

/**
 * Build a public directory projection from a legacy account document.
 *
 * Privacy rule: publish only profiles with a saved directory consent timestamp,
 * or a legacy profile that predates the consent field and explicitly selected
 * Public visibility. A present-but-empty consent field means the current user
 * has not opted in. Private email/phone values are never copied from the user row.
 */
function buildLegacyPublicProfile(userDoc = {}, docId = "") {
  const nested = userDoc && typeof userDoc.profileData === "object" && userDoc.profileData
    ? userDoc.profileData
    : {};
  const profile = { ...userDoc, ...nested };
  const uid = String(userDoc.uid || nested.uid || docId || "");
  if (!UUID_RE.test(uid)) return null;

  const normalizeVisibility = value => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "public" || normalized.startsWith("public ")) return "public";
    if (["followers", "followers-only", "followers_only", "approved followers"].includes(normalized)) return "followers";
    if (normalized === "private" || normalized.startsWith("private ")) return "private";
    return normalized;
  };
  const topVisibility = userDoc.profileVisibility || userDoc.visibility;
  const nestedVisibility = nested.profileVisibility || nested.visibility;
  const visibilityValues = [topVisibility, nestedVisibility].filter(value => value != null && String(value).trim() !== "").map(normalizeVisibility);
  if (visibilityValues.some(value => value !== "public")) return null;
  const visibility = normalizeVisibility(nestedVisibility || topVisibility);

  const consentFieldExists = Object.prototype.hasOwnProperty.call(userDoc, "profileConsentAt")
    || Object.prototype.hasOwnProperty.call(nested, "profileConsentAt");
  const explicitConsent = Boolean(profile.profileConsentAt);
  const legacyPublicChoice = !consentFieldExists && visibility === "public";
  if (!explicitConsent && !legacyPublicChoice) return null;

  const displayName = String(profile.displayName || profile.name || profile.fullName || "").trim().slice(0, 80);
  const username = String(profile.username || profile.handle || "").trim().replace(/^@/, "").slice(0, 24);
  if (!displayName || !USERNAME_RE.test(username)) return null;

  const list = value => Array.isArray(value) ? value.map(item => String(item || "").trim()).filter(Boolean).slice(0, 30) : [];
  const skills = list(profile.skills);
  const interests = list(profile.interests);
  const rolesInterested = list(profile.rolesInterested);
  const publicEmail = String(profile.publicEmail || "").trim().slice(0, 254);
  const publicPhone = String(profile.publicPhone || "").trim().slice(0, 32);
  const now = new Date().toISOString();

  // Explicit allow-list: do not spread private account fields into publicProfiles.
  return {
    uid,
    displayName,
    nameLower: displayName.toLowerCase(),
    username,
    usernameLower: username.toLowerCase(),
    college: String(profile.college || "").slice(0, 120),
    collegeLower: String(profile.collegeLower || profile.college || "").toLowerCase().slice(0, 120),
    collegeShort: String(profile.collegeShort || "").slice(0, 40),
    collegeShortLower: String(profile.collegeShortLower || profile.collegeShort || "").toLowerCase().slice(0, 40),
    course: String(profile.course || "").slice(0, 100),
    courseLower: String(profile.courseLower || profile.course || "").toLowerCase().slice(0, 100),
    studyLevel: String(profile.studyLevel || "").slice(0, 40),
    graduationYear: Number(profile.graduationYear) || null,
    city: String(profile.city || "").slice(0, 80),
    country: String(profile.country || "").slice(0, 80),
    bio: String(profile.bio || "").slice(0, 500),
    statusText: String(profile.statusText || "").slice(0, 100),
    pronouns: String(profile.pronouns || "").slice(0, 50),
    avatarUrl: safeUrl(profile.avatarUrl),
    coverUrl: safeUrl(profile.coverUrl),
    website: safeUrl(profile.website || profile.portfolio),
    github: safeUrl(profile.github),
    linkedin: safeUrl(profile.linkedin),
    portfolio: safeUrl(profile.portfolio),
    skills,
    skillsLower: list(profile.skillsLower).length ? list(profile.skillsLower) : skills.map(item => item.toLowerCase()),
    interests,
    interestsLower: list(profile.interestsLower).length ? list(profile.interestsLower) : interests.map(item => item.toLowerCase()),
    rolesInterested,
    availability: String(profile.availability || "").slice(0, 60),
    preferredMode: String(profile.preferredMode || "").slice(0, 40),
    lookingForTeam: profile.lookingForTeam === true,
    publicEmail,
    publicEmailLower: publicEmail.toLowerCase(),
    publicPhone,
    publicPhoneDigits: publicPhone.replace(/\D/g, ""),
    profileVisibility: "public",
    profileConsentAt: profile.profileConsentAt || profile.updatedAt || profile.createdAt || now,
    hackathonsParticipatedCount: Math.max(0, Number(profile.hackathonsParticipatedCount) || 0),
    joinedAt: profile.joinedAt || profile.createdAt || userDoc.createdAt || now,
    createdAt: profile.createdAt || userDoc.createdAt || now,
    updatedAt: profile.updatedAt || userDoc.updatedAt || now
  };
}

function safeUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) ? url.toString().slice(0, 2048) : "";
  } catch {
    return "";
  }
}

module.exports = { buildLegacyPublicProfile };
