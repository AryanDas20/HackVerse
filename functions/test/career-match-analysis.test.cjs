const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../public/career-match.js'), 'utf8');
const start = source.indexOf('function hasSkill(');
const end = source.indexOf('function countSkill(', start);
assert.ok(start >= 0 && end > start, 'Career Match skill matcher should exist');
const hasSkill = new Function(`${source.slice(start, end)}; return hasSkill;`)();

test('ReactJS and React.js aliases are recognised as React', () => {
  assert.equal(hasSkill('Built a ReactJS interface', ['react', 'reactjs', 'react.js']), true);
  assert.equal(hasSkill('Built a React.js interface', ['react', 'reactjs', 'react.js']), true);
});

test('Java is not inferred from JavaScript and vice versa', () => {
  assert.equal(hasSkill('Built a JavaScript application', ['java']), false);
  assert.equal(hasSkill('Built a Java service', ['javascript']), false);
  assert.equal(hasSkill('Built a Java service', ['java']), true);
});

test('Skill matches use token boundaries rather than partial words', () => {
  assert.equal(hasSkill('Used SQL queries', ['sql']), true);
  assert.equal(hasSkill('Used NoSQL queries', ['sql']), false);
});
