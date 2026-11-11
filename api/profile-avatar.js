const { getApps, initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("node:crypto");

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
function firebaseAuth() {
  const existing = getApps();
  if (existing.length) return getAuth(existing[0]);
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON in Vercel.");
  let serviceAccount;
  try { serviceAccount = JSON.parse(raw); } catch { throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON."); }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) throw new Error("Firebase service account is missing required fields.");
  serviceAccount.private_key = String(serviceAccount.private_key).replace(/\\n/g, "\n");
  const app = initializeApp({ credential: cert(serviceAccount), projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id });
  return getAuth(app);
}
function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Profile photo storage is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const bucket = String(process.env.SUPABASE_PROFILE_BUCKET || "profile-avatars").replace(/[^a-z0-9-]/gi, "").slice(0, 63);
  return { client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), bucket };
}
function cleanName(value) {
  return String(value || "avatar").normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 80) || "avatar";
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  try {
    const bearer = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearer) return res.status(401).json({ error: "Sign in to upload a profile photo." });
    const decoded = await firebaseAuth().verifyIdToken(bearer, true);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (body.action !== "create-upload") return res.status(400).json({ error: "Unknown profile photo action." });
    const type = String(body.contentType || "").toLowerCase().split(";")[0].trim();
    const size = Number(body.size);
    if (!ALLOWED_TYPES.has(type)) return res.status(415).json({ error: "Use a JPG, PNG or WebP image." });
    if (!Number.isFinite(size) || size < 1 || size > MAX_AVATAR_BYTES) return res.status(413).json({ error: "Profile photos must be 5 MB or smaller." });
    const { client, bucket } = supabase();
    const path = `${decoded.uid}/${randomUUID()}_${cleanName(body.fileName)}`;
    const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data?.token) {
      console.error("Supabase profile photo upload URL error", error);
      return res.status(502).json({ error: "Could not prepare a profile photo upload. Check that the profile-avatars bucket exists." });
    }
    const publicUrl = client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    return res.status(200).json({ path, token: data.token, bucket, publicUrl });
  } catch (error) {
    const status = error?.code === "auth/id-token-expired" ? 401 : 500;
    if (status >= 500) console.error("Profile photo endpoint failed", error);
    return res.status(status).json({ error: error.message || "Profile photo service is unavailable." });
  }
};
