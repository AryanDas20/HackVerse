const OPPORTUNITY_CATEGORIES = new Set([
  "hackathon", "coding-event", "case-competition", "bootcamp", "course", "certification",
  "internship", "scholarship", "fellowship", "grant", "research", "competition", "volunteering"
]);

function classifyOpportunity(text, sourceCategories = []) {
  const value = String(text || "").toLowerCase();
  const categoryList = (Array.isArray(sourceCategories) ? sourceCategories : [sourceCategories])
    .map(x => String(x || "").toLowerCase().trim()).filter(Boolean);
  const categories = categoryList.join(" ");
  const combined = `${value} ${categories}`;
  if (/\bhackathon\b|\bhack-a-thon\b/.test(combined)) return { relevant: true, category: "hackathon", score: 95 };
  if (/\binternship\b|intern\s?ship|summer intern|winter intern|work experience placement/.test(combined)) return { relevant: true, category: "internship", score: 90 };
  if (/\bscholarship\b|tuition waiver|student bursary|education funding/.test(combined)) return { relevant: true, category: "scholarship", score: 90 };
  if (/\bfellowship\b|fellows? programme|fellows? program/.test(combined)) return { relevant: true, category: "fellowship", score: 89 };
  if (/\bgrant\b|seed funding|research funding|innovation fund/.test(combined)) return { relevant: true, category: "grant", score: 86 };
  if (/research assistant|research opportunity|undergraduate research|research programme|research program/.test(combined)) return { relevant: true, category: "research", score: 85 };
  if (/boot\s?camp|developer intensive|coding intensive/.test(combined)) return { relevant: true, category: "bootcamp", score: 88 };
  if (/professional certification|certification exam|certificate programme|certificate program|certification course/.test(combined)) return { relevant: true, category: "certification", score: 86 };
  if (/online course|self[- ]paced course|course enrollment|course enrolment|learning path|massive open online course|\bmooc\b/.test(combined)) return { relevant: true, category: "course", score: 85 };
  if (/case\s?(study|competition|challenge)|business case/.test(combined)) return { relevant: true, category: "case-competition", score: 84 };
  if (/coding contest|programming contest|code jam|coding challenge|\bctf\b|capture the flag|algorithm contest|developer challenge|open source sprint/.test(combined) || /\bcoding\b|\bcontest\b/.test(categories) && /code|program|developer|software|algorithm|security/.test(value)) return { relevant: true, category: "coding-event", score: 82 };
  if (/\bcompetition\b|challenge programme|challenge program|innovation challenge|student contest/.test(combined)) return { relevant: true, category: "competition", score: 80 };
  if (/volunteer opportunity|volunteering programme|volunteering program|community service/.test(combined)) return { relevant: true, category: "volunteering", score: 78 };
  const explicitCategory = categoryList.find(category => OPPORTUNITY_CATEGORIES.has(category));
  if (explicitCategory) return { relevant: true, category: explicitCategory, score: 80 };
  const weak = /\bhack\b.{0,30}\b(build|event|challenge|competition)\b/.test(value);
  return { relevant: weak, category: weak ? "hackathon" : "", score: weak ? 65 : 0 };
}

module.exports = { OPPORTUNITY_CATEGORIES, classifyOpportunity };
