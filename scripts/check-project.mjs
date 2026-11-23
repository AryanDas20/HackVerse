import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const roots = ['api', 'functions', 'lib', 'public', 'scripts', 'tests'];
const codeExtensions = new Set(['.js', '.mjs', '.cjs']);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile() && codeExtensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

const files = [];
for (const root of roots) files.push(...await walk(root));
files.sort();
let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures += 1;
    console.error(`\nSyntax check failed: ${file}`);
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
}
if (failures) {
  console.error(`\n${failures} of ${files.length} JavaScript files failed syntax validation.`);
  process.exit(1);
}
console.log(`Syntax check passed for ${files.length} JavaScript files.`);
