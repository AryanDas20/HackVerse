const test = require("node:test");
const assert = require("node:assert/strict");
const { extractDeadline } = require("../lib/deadline");

test("parses a day-first deadline", () => {
  assert.equal(extractDeadline("Registration deadline: 11 November 2026").toISOString(), "2026-11-11T00:00:00.000Z");
});

test("parses month-first deadline text", () => {
  assert.equal(extractDeadline("Application deadline: Nov 11, 2026").toISOString(), "2026-11-11T00:00:00.000Z");
});

test("parses a weekday-prefixed GMT registration close", () => {
  assert.equal(extractDeadline("Registration closes Wed Nov 11 2026 23:59 GMT").toISOString(), "2026-11-11T23:59:00.000Z");
});

test("parses ISO deadlines", () => {
  assert.equal(extractDeadline("Submission deadline: 2026-11-11").toISOString(), "2026-11-11T00:00:00.000Z");
});

test("returns null when no deadline is present", () => {
  assert.equal(extractDeadline("Applications are now open"), null);
});
