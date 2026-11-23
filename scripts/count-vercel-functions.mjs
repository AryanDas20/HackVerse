import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const apiRoot = path.resolve('api');
const supportedExtensions = new Set(['.js', '.mjs', '.cjs', '.ts']);
const privatePrefix = /^[_\.]/;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (privatePrefix.test(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile() && supportedExtensions.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

const candidates = (await walk(apiRoot))
  .map(file => path.relative(process.cwd(), file).split(path.sep).join('/'))
  .sort();

console.log(`Vercel API function candidates: ${candidates.length}/12`);
for (const file of candidates) console.log(`  ${file}`);
if (candidates.length > 12) {
  console.error(`\nHobby limit exceeded by ${candidates.length - 12} function candidate(s).`);
  process.exitCode = 1;
} else {
  console.log(`\nWithin the Vercel Hobby function-count limit (${12 - candidates.length} slot(s) remain).`);
}
