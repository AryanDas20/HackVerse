const URL_RE = /^https?:\/\//i;
const USERNAME_RE = /^[a-z0-9_]{3,24}$/i;
const CATEGORIES = new Set(["spam","harassment","hate_or_abuse","impersonation","scam_or_fraud","privacy","copyright","unsafe_content","technical_issue","other"]);
const TARGETS = new Set(["user","post","comment","message","site_issue","other"]);
const VISIBILITIES = new Set(["public","followers","private"]);

function plainText(value, max = 3000) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
}
function safeHttpUrl(value) {
  const raw = plainText(value, 2048);
  if (!raw) return null;
  try { const url = new URL(raw); return ["http:","https:"].includes(url.protocol) ? url.toString() : null; }
  catch { return null; }
}
function parseTags(content) {
  return [...new Set((String(content).match(/#[\p{L}\p{N}_]{1,40}/gu) || []).map(x => x.slice(1).toLowerCase()))].slice(0, 20);
}
function parseMentions(content) {
  return [...new Set((String(content).match(/@[A-Za-z0-9_]{3,24}/g) || []).map(x => x.slice(1).toLowerCase()))].slice(0, 20);
}
function validatePost(body = {}) {
  const content = plainText(body.content, 3000);
  const visibility = VISIBILITIES.has(body.visibility) ? body.visibility : "public";
  const mediaUrl = safeHttpUrl(body.mediaUrl);
  const mediaType = ["image","video"].includes(body.mediaType) ? body.mediaType : null;
  if (!content) throw Object.assign(new Error("Write something before publishing."), { status: 400 });
  if (body.mediaUrl && !mediaUrl) throw Object.assign(new Error("Media links must use HTTPS or HTTP."), { status: 400 });
  if (body.mediaUrl && !mediaType) throw Object.assign(new Error("Choose whether the attachment is an image or video."), { status: 400 });
  return { content, visibility, media_url: mediaUrl, media_type: mediaType, hashtags: parseTags(content), mentions: parseMentions(content) };
}
function validateReport(body = {}) {
  const targetType = TARGETS.has(body.targetType) ? body.targetType : "other";
  const category = CATEGORIES.has(body.category) ? body.category : "other";
  const details = plainText(body.details, 2000);
  if (details.length < 10) throw Object.assign(new Error("Please provide at least 10 characters of detail so the report can be reviewed."), { status: 400 });
  const evidenceUrl = safeHttpUrl(body.evidenceUrl);
  if (body.evidenceUrl && !evidenceUrl) throw Object.assign(new Error("Evidence links must use HTTPS or HTTP."), { status: 400 });
  return { target_type: targetType, target_id: plainText(body.targetId, 180) || null, category, details, evidence_url: evidenceUrl };
}
module.exports = { plainText, safeHttpUrl, parseTags, parseMentions, validatePost, validateReport, USERNAME_RE, CATEGORIES, TARGETS };
