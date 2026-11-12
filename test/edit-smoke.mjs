import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { editImages } from '../lib/core.js';

function creds() {
  try {
    return fs.readFileSync(path.join(os.homedir(), '.dsh', '.credentials.yaml'), 'utf8');
  } catch {
    return '';
  }
}

function ref(name) {
  return creds().match(new RegExp(name + ':\\s*"?(\\S+?)"?\\s*$', 'm'))?.[1];
}

const source = process.argv[2];
const baseUrl = process.env.TEST_BASE_URL || process.argv[3];
const apiKeyRef = process.argv[4] || 'IMAGE_GEN_KEY_P_55DB4BD7';
const model = process.argv[5] || 'nano-banana-pro';

const apiKey = ref(apiKeyRef);
console.log('source:', source);
console.log('endpoint:', baseUrl, '| model:', model, '| key:', Boolean(apiKey));

if (!source || !fs.existsSync(source)) {
  console.log('源图不存在，跳过');
  process.exit(0);
}

const outDir = path.join(os.tmpdir(), 'dsh-edit-test');
const result = await editImages(
  { baseUrl, apiKey, model, outDir, timeoutMs: 180000 },
  { prompt: '把这张图的背景换成纯蓝色，人物风格保持不变', images: [source], n: 1 },
  { fs, path },
);

console.log('ok:', result.ok);
if (result.ok) {
  console.log('files:', result.files);
} else {
  console.log('code:', result.code, '| message:', result.message, '| detail:', result.detail);
}
