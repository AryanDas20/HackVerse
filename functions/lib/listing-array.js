"use strict";

const PRIORITY_KEYS = ["hackathons", "opportunities", "events", "listings"];
const WRAPPER_KEYS = ["items", "results", "result", "data", "response", "nodes"];

function findListingArray(body, depth = 0) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object" || depth > 4) return [];

  // Provider-specific collections always win.
  for (const key of PRIORITY_KEYS) {
    const value = body[key];
    if (Array.isArray(value)) return value;
  }

  // Search nested objects before generic arrays so `{ items: ..., data: { hackathons: ... } }`
  // selects the actual opportunity collection instead of metadata.
  for (const key of [...PRIORITY_KEYS, ...WRAPPER_KEYS]) {
    const value = body[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const found = findListingArray(value, depth + 1);
      if (found.length) return found;
    }
  }

  for (const key of WRAPPER_KEYS) {
    const value = body[key];
    if (Array.isArray(value)) return value;
  }

  for (const value of Object.values(body)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const found = findListingArray(value, depth + 1);
      if (found.length) return found;
    }
  }
  return [];
}

module.exports = { findListingArray };
