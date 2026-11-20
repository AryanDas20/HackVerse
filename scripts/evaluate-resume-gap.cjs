'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { analyzeResumeGap, extractSkills, SKILLS } = require('../api/lib/resume-gap');

const filePath = path.resolve(process.argv[2] || 'benchmarks/resume-gap-answer-key.json');
if (!fs.existsSync(filePath)) {
  console.error(`Answer key not found: ${filePath}`);
  console.error('Copy benchmarks/resume-gap-answer-key.example.json to benchmarks/resume-gap-answer-key.json and enter judge-reviewed cases.');
  process.exit(2);
}

let benchmark;
try { benchmark = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
catch (error) { console.error(`Could not read answer key: ${error.message}`); process.exit(2); }
const cases = Array.isArray(benchmark.cases) ? benchmark.cases : [];
const knownKeys = new Set(SKILLS.map(skill => skill.key));
if (!cases.length) {
  console.error('The answer key must contain at least one judge-reviewed case.');
  process.exit(2);
}

let totalIntersection = 0;
let totalUnion = 0;
let exactCases = 0;
const reports = [];
for (const item of cases) {
  if (!item || !item.resumeText || !item.jobDescription || !Array.isArray(item.expectedMissingSkills)) {
    console.error(`Invalid benchmark case: ${item?.id || '(missing id)'}`);
    process.exit(2);
  }
  const predicted = analyzeResumeGap(item.resumeText, item.jobDescription).missingSkills.map(skill => skill.key);
  const expected = item.expectedMissingSkills.map(value => String(value).trim()).filter(Boolean);
  const expectedKeys = new Set(expected.flatMap(value => {
    const normalised = value.toLowerCase();
    if (knownKeys.has(normalised)) return [normalised];
    const extracted = extractSkills(value).map(skill => skill.key);
    return extracted.length ? extracted : [normalised];
  }));
  const predictedKeys = new Set(predicted);
  const intersection = [...predictedKeys].filter(key => expectedKeys.has(key)).length;
  const union = new Set([...predictedKeys, ...expectedKeys]).size;
  totalIntersection += intersection;
  totalUnion += union;
  const exact = predictedKeys.size === expectedKeys.size && intersection === expectedKeys.size;
  if (exact) exactCases += 1;
  reports.push({ id: item.id, expected: [...expectedKeys], predicted: [...predictedKeys], jaccard: union ? Math.round(intersection / union * 100) : 100, exact });
}
const agreement = totalUnion ? Math.round(totalIntersection / totalUnion * 100) : 100;
console.log(JSON.stringify({
  metric: 'micro-averaged Jaccard overlap of predicted and judge-labelled missing-skill sets',
  agreementPercent: agreement,
  targetPercent: 70,
  meetsTarget: agreement >= 70,
  exactCasePercent: Math.round(exactCases / cases.length * 100),
  caseCount: cases.length,
  cases: reports
}, null, 2));
process.exit(agreement >= 70 ? 0 : 1);
