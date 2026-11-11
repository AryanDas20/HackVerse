const test = require("node:test");
const assert = require("node:assert/strict");
const { isSafeTitleDuplicate, normalizeIdentity } = require("../lib/duplicate-match");

const base = {
  category: "hackathon",
  title: "PayPal AI Hackathon 2026",
  organizer: "PayPal",
  sourceName: "Devpost",
  registrationDeadline: new Date("2026-11-20T18:00:00Z"),
  location: "Online"
};

test("normalizes case, punctuation and unicode marks", () => {
  assert.equal(normalizeIdentity("PayPal — AI Hackathon!"), "paypal ai hackathon");
});

test("merges exact titles when the organiser independently matches", () => {
  assert.equal(isSafeTitleDuplicate(base, { ...base, sourceName: "Unstop", sourceUrl: "https://unstop.com/event/1" }), true);
});

test("does not merge an exact title when organisers differ and no date/location signal exists", () => {
  assert.equal(isSafeTitleDuplicate(base, { ...base, organizer: "University of Somewhere", registrationDeadline: null, location: "Delhi" }), false);
});

test("merges exact titles with close dates and matching locations when organiser is unavailable", () => {
  const candidate = { ...base, organizer: "Devpost", sourceName: "Devpost" };
  const existing = { ...base, organizer: "Unstop", sourceName: "Unstop", registrationDeadline: new Date("2026-11-21T10:00:00Z") };
  assert.equal(isSafeTitleDuplicate(candidate, existing), true);
});

test("does not merge different editions when dates and organisers differ", () => {
  const existing = { ...base, title: "PayPal AI Hackathon 2025", organizer: "PayPal" };
  assert.equal(isSafeTitleDuplicate(base, existing), false);
});

test("does not merge across opportunity categories", () => {
  assert.equal(isSafeTitleDuplicate(base, { ...base, category: "course" }), false);
});
