/** Decide whether a saved profile may be published in the public Builders directory. */
export function evaluateProfilePublication({ visibility, consent, displayName, username }) {
  if (visibility !== "public") return { canPublish: false, reason: null };
  if (!consent) return { canPublish: false, reason: "consent" };
  const name = String(displayName || "").trim();
  const handle = String(username || "").trim().replace(/^@/, "");
  if (!name || !/^[A-Za-z0-9_]{3,24}$/.test(handle)) {
    return { canPublish: false, reason: "identity" };
  }
  return { canPublish: true, reason: null };
}
