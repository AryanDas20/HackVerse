const { getApps, initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("node:crypto");

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_SIGNED_DOWNLOADS = 40;
const SIGNED_DOWNLOAD_SECONDS = 15 * 60;
const ALLOWED_EXACT_TYPES = new Set([
  "application/pdf", "text/plain", "application/zip", "application/msword",
  "application/vnd.ms-excel", "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

function firebaseAdmin() {
  const existing = getApps();
  if (existing.length) {
    const app = existing[0];
    return { db: getFirestore(app), auth: getAuth(app) };
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT_JSON in Vercel.");
  let serviceAccount;
  try { serviceAccount = JSON.parse(raw); }
  catch { throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON."); }
  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("The Firebase service-account JSON is missing required fields.");
  }
  serviceAccount.private_key = String(serviceAccount.private_key).replace(/\\n/g, "\n");
  const app = initializeApp({ credential: cert(serviceAccount), projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id });
  return { db: getFirestore(app), auth: getAuth(app) };
}

function supabaseStorage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase media storage is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel.");
  const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || "chat-media").replace(/[^a-z0-9-]/gi, "").slice(0, 63);
  if (!bucket) throw new Error("SUPABASE_STORAGE_BUCKET is invalid.");
  return { client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), bucket };
}

function safeFileName(value) {
  const clean = String(value || "attachment").normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 100);
  return clean || "attachment";
}

function allowedContentType(value) {
  const type = String(value || "").toLowerCase().split(";")[0].trim();
  return /^(image|video|audio)\/[a-z0-9.+-]+$/.test(type) || ALLOWED_EXACT_TYPES.has(type);
}

async function verifyConversation(db, conversationId, uid) {
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(String(conversationId || ""))) {
    const error = new Error("A valid conversation ID is required."); error.statusCode = 400; throw error;
  }
  const snapshot = await db.collection("conversations").doc(conversationId).get();
  const data = snapshot.exists ? snapshot.data() : null;
  if (!data || data.deleted === true || !Array.isArray(data.participants) || !data.participants.includes(uid)) {
    const error = new Error("You are not a member of this conversation."); error.statusCode = 403; throw error;
  }
  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  try {
    const authorization = String(req.headers.authorization || "");
    const idToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!idToken) return res.status(401).json({ error: "Sign in to use chat media." });

    const { db, auth } = firebaseAdmin();
    const decoded = await auth.verifyIdToken(idToken, true);
    const uid = decoded.uid;
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const conversationId = String(body.conversationId || "");
    const { client, bucket } = supabaseStorage();
    const conversation = await verifyConversation(db, conversationId, uid);

    if (body.action === "create-upload") {
      const fileName = safeFileName(body.fileName);
      const contentType = String(body.contentType || "").toLowerCase().split(";")[0].trim();
      const size = Number(body.size);
      if (!Number.isFinite(size) || size < 1 || size > MAX_FILE_BYTES) {
        return res.status(413).json({ error: "Attachments must be between 1 byte and 15 MB." });
      }
      if (!allowedContentType(contentType)) return res.status(415).json({ error: "That file type is not supported." });
      const path = `chat-media/${conversationId}/${uid}/${randomUUID()}_${fileName}`;
      const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path);
      if (error || !data?.token) {
        console.error("Supabase signed upload URL error", error);
        return res.status(502).json({ error: "Could not prepare a secure upload. Check your Supabase bucket configuration." });
      }
      return res.status(200).json({ path, token: data.token, bucket });
    }

    if (body.action === "create-downloads") {
      const paths = Array.isArray(body.paths) ? [...new Set(body.paths.map(value => String(value || "")))] : [];
      if (!paths.length) return res.status(200).json({ urls: [] });
      if (paths.length > MAX_SIGNED_DOWNLOADS) return res.status(400).json({ error: `Request no more than ${MAX_SIGNED_DOWNLOADS} attachments at once.` });
      const prefix = `chat-media/${conversationId}/`;
      const invalidPath = paths.some(path => {
        if (!path.startsWith(prefix) || path.includes("..") || path.length > 300) return true;
        const remaining = path.slice(prefix.length).split("/");
        return remaining.length !== 2 || !remaining[0] || !conversation.participants.includes(remaining[0]) || !/^[A-Za-z0-9._-]{1,120}$/.test(remaining[1]);
      });
      if (invalidPath) return res.status(403).json({ error: "One or more attachment paths do not belong to a member of this conversation." });
      const { data, error } = await client.storage.from(bucket).createSignedUrls(paths, SIGNED_DOWNLOAD_SECONDS);
      if (error) {
        console.error("Supabase signed download URL error", error);
        return res.status(502).json({ error: "Could not open one or more private attachments." });
      }
      return res.status(200).json({ urls: (data || []).filter(item => item.signedUrl).map(item => ({ path: item.path, signedUrl: item.signedUrl, expiresIn: SIGNED_DOWNLOAD_SECONDS })) });
    }

    return res.status(400).json({ error: "Unknown media action." });
  } catch (error) {
    const status = error?.statusCode || (error?.code === "auth/id-token-expired" || error?.code === "auth/argument-error" ? 401 : 500);
    if (status >= 500) console.error("Chat media endpoint failed", error);
    return res.status(status).json({ error: status === 401 ? "Your sign-in has expired. Sign in again." : (error.message || "The chat media service is temporarily unavailable.") });
  }
};
