const { createClient } = require("@supabase/supabase-js");
const { buildLegacyPublicProfile } = require("../lib/profile-directory");

const PAGE_SIZE = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let cachedClient = null;
let lastSuccessfulReconcileAt = 0;

function adminClient() {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Object.assign(new Error("Profile directory recovery is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to Vercel."), { status: 503 });
  cachedClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cachedClient;
}

async function loadCollection(client, collectionPath) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client.from("documents")
      .select("doc_id,data,created_at,updated_at")
      .eq("collection_path", collectionPath)
      .order("doc_id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

async function reconcile(client) {
  const [users, existingProfiles] = await Promise.all([
    loadCollection(client, "users"),
    loadCollection(client, "publicProfiles")
  ]);
  const existingIds = new Set(existingProfiles.map(row => String(row.doc_id)));
  const missingRows = [];
  let eligible = 0;
  for (const row of users) {
    const uid = String(row.doc_id || "");
    if (!UUID_RE.test(uid)) continue;
    const profile = buildLegacyPublicProfile({ ...(row.data || {}), createdAt: row.data?.createdAt || row.created_at, updatedAt: row.data?.updatedAt || row.updated_at }, uid);
    if (!profile) continue;
    eligible += 1;
    if (existingIds.has(uid)) continue;
    missingRows.push({
      path: `publicProfiles/${uid}`,
      collection_path: "publicProfiles",
      doc_id: uid,
      owner_uid: uid,
      data: profile,
      created_at: row.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  let restored = 0;
  for (let index = 0; index < missingRows.length; index += PAGE_SIZE) {
    const batch = missingRows.slice(index, index + PAGE_SIZE);
    const { error } = await client.from("documents").upsert(batch, { onConflict: "path", ignoreDuplicates: true });
    if (error) throw error;
    restored += batch.length;
  }
  return { scanned: users.length, eligible, restored };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
  try {
    const client = adminClient();
    const token = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return res.status(401).json({ error: "Sign in to refresh the Builders directory." });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Your sign-in has expired. Sign in again." });
    // Directory repair is global, not user-specific. Avoid rescanning the
    // entire legacy users collection for each member hitting this endpoint.
    if (Date.now() - lastSuccessfulReconcileAt < 10 * 60 * 1000) {
      return res.status(200).json({ scanned: 0, eligible: 0, restored: 0, cached: true });
    }
    const result = await reconcile(client);
    lastSuccessfulReconcileAt = Date.now();
    return res.status(200).json(result);
  } catch (error) {
    console.error("Profile directory reconciliation failed", error);
    return res.status(error.status || 500).json({ error: error.message || "Could not refresh the Builders directory." });
  }
};

module.exports.reconcile = reconcile;
