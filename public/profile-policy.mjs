/** Public directory publication is controlled by the member's Public / Private setting. */
export function evaluateProfilePublication({ visibility, displayName, username }) {
  if (visibility !== "public") return { canPublish: false, reason: null };
  const name = String(displayName || "").trim();
  const handle = String(username || "").trim().replace(/^@/, "");
  if (!name || !/^[A-Za-z0-9_]{3,24}$/.test(handle)) return { canPublish: false, reason: "identity" };
  return { canPublish: true, reason: null };
}
