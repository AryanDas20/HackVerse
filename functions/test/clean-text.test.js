const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanText } = require("../lib/clean-text");

test("preserves ordinary text", () => {
  assert.equal(cleanText("Hello HackStop"), "Hello HackStop");
});

test("extracts a readable name from an object", () => {
  assert.equal(cleanText({ name: "Unstop" }), "Unstop");
});

test("supports alternate readable object fields", () => {
  assert.equal(cleanText({ title: "Global Hackathon" }), "Global Hackathon");
  assert.equal(cleanText({ display_name: "OpenHPI" }), "OpenHPI");
});

test("does not stringify arrays or unreadable objects", () => {
  assert.equal(cleanText(["one", "two"]), "");
  assert.equal(cleanText({ id: 123 }), "");
});

test("handles null, undefined and unsupported values", () => {
  assert.equal(cleanText(null), "");
  assert.equal(cleanText(undefined), "");
  assert.equal(cleanText(true), "");
});

test("preserves numeric values as text", () => {
  assert.equal(cleanText(2026), "2026");
});

test("decodes common entities and removes HTML tags", () => {
  assert.equal(cleanText("<b>Hack</b>&nbsp;&amp; Build"), "Hack & Build");
});

test("normalizes whitespace and respects the maximum length", () => {
  assert.equal(cleanText("  Hack   Stop  "), "Hack Stop");
  assert.equal(cleanText("HackStop", 4), "Hack");
});
