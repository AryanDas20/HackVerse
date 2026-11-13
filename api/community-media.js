const { createClient } = require("@supabase/supabase-js");
const { randomUUID } = require("node:crypto");

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const cleanName = value => String(value || "project-image").replace(/[^a-z0-9._-]/gi, "_").slice(0, 90) || "project-image";

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Community image storage is not configured. Add Supabase server credentials to Vercel.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  try {
    const token = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return res.status(401).json({ error: "Sign in to upload project images." });
    const client = adminClient();
    const { data: authData, error: authError } = await client.auth.getUser(token);
    if (authError || !authData?.user) return res.status(401).json({ error: "Your sign-in has expired. Sign in again." });

    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (body.action !== "create-upload") return res.status(400).json({ error: "Unknown community media action." });
    const type = String(body.contentType || "").toLowerCase().split(";")[0].trim();
    const size = Number(body.size);
    if (!ALLOWED_TYPES.has(type)) return res.status(415).json({ error: "Use a JPG, PNG or WebP project image." });
    if (!Number.isFinite(size) || size < 1 || size > MAX_IMAGE_BYTES) return res.status(413).json({ error: "Project images must be 8 MB or smaller." });

    const bucket = String(process.env.SUPABASE_COMMUNITY_BUCKET || "community-media").replace(/[^a-z0-9-]/gi, "").slice(0, 63);
    const path = `${authData.user.id}/projects/${randomUUID()}_${cleanName(body.fileName)}`;
    const { data, error } = await client.storage.from(bucket).createSignedUploadUrl(path);
    if (error || !data?.token) return res.status(502).json({ error: "Could not prepare the image upload. Create the community-media bucket in Supabase Storage." });
    const publicUrl = client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    return res.status(200).json({ path, token: data.token, bucket, publicUrl });
  } catch (error) {
    console.error("Community media upload preparation failed", error);
    return res.status(500).json({ error: error.message || "Community image storage is unavailable." });
  }
};
