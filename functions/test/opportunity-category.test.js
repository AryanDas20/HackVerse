const test = require("node:test");
const assert = require("node:assert/strict");
const { OPPORTUNITY_CATEGORIES, classifyOpportunity } = require("../lib/opportunity-category");

test("classifies every supported opportunity category", () => {
  const cases = [
    ["Global student hackathon registration", "hackathon"],
    ["Remote software engineering internship", "internship"],
    ["Fully funded student scholarship", "scholarship"],
    ["Young leaders fellowship applications", "fellowship"],
    ["Student innovation grant", "grant"],
    ["Undergraduate research opportunity", "research"],
    ["Online developer bootcamp", "bootcamp"],
    ["Free online course enrollment", "course"],
    ["Professional certification course", "certification"],
    ["University business case competition", "case-competition"],
    ["International coding contest", "coding-event"],
    ["Student innovation competition", "competition"],
    ["Community volunteering programme", "volunteering"]
  ];
  for (const [title, expected] of cases) {
    const result = classifyOpportunity(title);
    assert.equal(result.relevant, true, title);
    assert.equal(result.category, expected, title);
  }
});

test("supports explicit source category hints", () => {
  assert.equal(classifyOpportunity("Open call", ["internship"]).category, "internship");
  assert.equal(classifyOpportunity("Open call", ["scholarship"]).category, "scholarship");
});

test("does not classify unrelated announcements", () => {
  assert.deepEqual(classifyOpportunity("Quarterly company earnings announcement"), { relevant: false, category: "", score: 0 });
});

test("category allow-list includes all categories", () => {
  for (const category of ["internship", "scholarship", "fellowship", "grant", "research", "competition", "volunteering"]) {
    assert.equal(OPPORTUNITY_CATEGORIES.has(category), true);
  }
});
