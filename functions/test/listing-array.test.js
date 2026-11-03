const test = require("node:test");
const assert = require("node:assert/strict");
const { findListingArray } = require("../lib/listing-array");

test("accepts a top-level array", () => {
  const rows = [{ title: "HackStop Challenge" }];
  assert.deepEqual(findListingArray(rows), rows);
});

test("parses the Devfolio result array", () => {
  const rows = [{ name: "Devfolio Hackathon" }];
  assert.deepEqual(findListingArray({ result: rows }), rows);
});

test("parses the HackerEarth response array", () => {
  const rows = [{ title: "HackerEarth Event" }];
  assert.deepEqual(findListingArray({ response: rows }), rows);
});

test("parses nested provider arrays", () => {
  const rows = [{ title: "Nested Event" }];
  assert.deepEqual(findListingArray({ data: { results: rows } }), rows);
});

test("supports other common listing keys", () => {
  const rows = [{ title: "Opportunity" }];
  assert.deepEqual(findListingArray({ opportunities: rows }), rows);
});

test("returns an empty array for unsupported or empty responses", () => {
  assert.deepEqual(findListingArray(null), []);
  assert.deepEqual(findListingArray(undefined), []);
  assert.deepEqual(findListingArray("invalid"), []);
  assert.deepEqual(findListingArray({ data: { message: "No events" } }), []);
});
