/** Public visibility is the sole profile-directory choice; a valid identity is still required. */
export function evaluateProfilePublication({ visibility, displayName, username }) {
  if (visibility !== "public") return { canPublish: false, reason: null };
  const name = String(displayName || "").trim();
  const handle = String(username || "").trim().replace(/^@/, "");
  if (!name || !/^[A-Za-z0-9_]{3,24}$/.test(handle)) {
    return { canPublish: false, reason: "identity" };
  }
  return { canPublish: true, reason: null };
}
