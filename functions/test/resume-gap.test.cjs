const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeResumeGap, extractSkills, buildLearningPlan } = require('../../api/lib/resume-gap');

test('normalises ReactJS and React.js to the same canonical skill', () => {
  const result = analyzeResumeGap(
    'Frontend developer\nReact.js\nJavaScript',
    'Required skills:\nReactJS and JavaScript experience.'
  );
  assert.deepEqual(result.matchedSkills.map(skill => skill.name).sort(), ['JavaScript', 'React']);
  assert.equal(result.missingSkills.some(skill => skill.name === 'React'), false);
});

test('matches NodeJS and Node.js as one skill', () => {
  const result = analyzeResumeGap('Built APIs using NodeJS', 'Experience building services in Node.js');
  assert.equal(result.matchedSkills.some(skill => skill.name === 'Node.js'), true);
});

test('every missing skill retains its exact job-description line and line number', () => {
  const jobDescription = 'Role: Backend Engineer\nMust know PostgreSQL and Docker.\nAWS experience is preferred.';
  const result = analyzeResumeGap('Python and Git', jobDescription);
  const postgres = result.missingSkills.find(skill => skill.name === 'PostgreSQL');
  const aws = result.missingSkills.find(skill => skill.name === 'AWS');
  assert.equal(postgres.sourceLines[0].lineNumber, 2);
  assert.equal(postgres.sourceLines[0].text, 'Must know PostgreSQL and Docker.');
  assert.equal(aws.sourceLines[0].lineNumber, 3);
  assert.equal(aws.sourceLines[0].text, 'AWS experience is preferred.');
});

test('returns a 14-day learning plan for the top three gaps', () => {
  const result = analyzeResumeGap(
    'HTML and CSS',
    'Need React, TypeScript, Node.js, PostgreSQL and Docker.'
  );
  assert.equal(result.topGaps.length, 3);
  assert.equal(result.learningPlan.length, 14);
  assert.equal(result.learningPlan[0].day, 1);
  assert.equal(result.learningPlan[13].day, 14);
});

test('avoids treating React.js as JavaScript through the generic JS alias', () => {
  const skills = extractSkills('React.js developer');
  assert.equal(skills.some(skill => skill.key === 'react'), true);
  assert.equal(skills.some(skill => skill.key === 'javascript'), false);
});

test('returns an empty plan when the role contains no recognised skill', () => {
  assert.deepEqual(buildLearningPlan([]), []);
  const result = analyzeResumeGap('Team member and volunteer', 'A friendly and motivated person who enjoys teamwork.');
  assert.equal(result.totalJobSkills, 0);
  assert.equal(result.notice.length > 0, true);
});
