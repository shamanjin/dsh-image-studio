import fs from 'node:fs';

const src = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

function block(startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  return src.slice(start, end);
}

const zh = block('const zh = {', 'const en = {');
const en = block('const en = {', 'const css = [');

function keysOf(blockText) {
  const keys = new Set();
  for (const line of blockText.split('\n')) {
    const match = line.match(/^\s{2,}([A-Za-z][A-Za-z0-9]*):/);
    if (match) keys.add(match[1]);
  }
  return keys;
}

const zhKeys = keysOf(zh);
const enKeys = keysOf(en);

const used = new Set();
for (const match of src.matchAll(/\bt\("([A-Za-z][A-Za-z0-9]*)"\)/g)) used.add(match[1]);

const missingZh = [...used].filter((key) => !zhKeys.has(key));
const missingEn = [...used].filter((key) => !enKeys.has(key));
const unusedZh = [...zhKeys].filter((key) => !used.has(key));

console.log('locale keys zh:', zhKeys.size, '| en:', enKeys.size, '| used:', used.size);
console.log('missing in zh:', missingZh.join(', ') || '(none)');
console.log('missing in en:', missingEn.join(', ') || '(none)');
console.log('unused keys:', unusedZh.join(', ') || '(none)');

if (missingZh.length || missingEn.length) process.exitCode = 1;
