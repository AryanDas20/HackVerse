"use strict";

const LISTING_ARRAY_KEYS = [
  "data",
  "result",
  "results",
  "response",
  "hackathons",
  "events",
  "items",
  "opportunities"
];

function findListingArray(body) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];

  for (const key of LISTING_ARRAY_KEYS) {
    const value = body[key];

    if (Array.isArray(value)) return value;

    if (value && typeof value === "object") {
      for (const nestedKey of LISTING_ARRAY_KEYS) {
        if (Array.isArray(value[nestedKey])) return value[nestedKey];
      }
    }
  }

  return [];
}

module.exports = { findListingArray };
