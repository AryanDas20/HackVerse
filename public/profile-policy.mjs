/** Publish in the public Builders directory only after explicit consent.
 * Legacy profiles that predate this field are handled by the caller's migration rule.
 */
export function evaluateProfilePublication({ visibility, displayName, username, consent }) {
  if (visibility !== "public") return { canPublish: false, reason: null };
  if (consent !== true) return { canPublish: false, reason: "consent" };
  const name = String(displayName || "").trim();
  const handle = String(username || "").trim().replace(/^@/, "");
  if (!name || !/^[A-Za-z0-9_]{3,24}$/.test(handle)) return { canPublish: false, reason: "identity" };
  return { canPublish: true, reason: null };
}
