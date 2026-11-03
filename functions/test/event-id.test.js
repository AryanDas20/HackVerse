const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveEventId } = require("../lib/event-id");

const base = {
  candidateCategory: "hackathon",
  candidateId: "url-id",
  categoryEventId: "category-id",
  urlEventId: null,
  titleEventId: null,
  categoriesById: {}
};

test("uses the URL ID when it is free", () => {
  assert.equal(resolveEventId(base), "url-id");
});

test("uses the category ID if the URL ID belongs to another category", () => {
  assert.equal(resolveEventId({
    ...base,
    categoriesById: { "url-id": "course" }
  }), "category-id");
});

test("throws if both candidate and category IDs belong to other categories", () => {
  assert.throws(() => resolveEventId({
    ...base,
    categoriesById: {
      "url-id": "course",
      "category-id": "bootcamp"
    }
  }), /Category-safe event ID/);
});

test("reuses a compatible URL fingerprint target", () => {
  assert.equal(resolveEventId({
    ...base,
    urlEventId: "existing-url-event",
    categoriesById: {
      "existing-url-event": "hackathon",
      "url-id": "course"
    }
  }), "existing-url-event");
});

test("reuses a compatible title fingerprint target", () => {
  assert.equal(resolveEventId({
    ...base,
    titleEventId: "existing-title-event",
    categoriesById: {
      "existing-title-event": "hackathon"
    }
  }), "existing-title-event");
});

test("reuses an existing compatible category ID", () => {
  assert.equal(resolveEventId({
    ...base,
    categoriesById: {
      "category-id": "hackathon"
    }
  }), "category-id");
});

test("does not reject a category-ID collision when a compatible fingerprint exists", () => {
  assert.equal(resolveEventId({
    ...base,
    urlEventId: "safe-event",
    categoriesById: {
      "safe-event": "hackathon",
      "category-id": "course",
      "url-id": "bootcamp"
    }
  }), "safe-event");
});
