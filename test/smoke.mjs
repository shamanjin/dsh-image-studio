import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { listModels, testConnection, generateImages, DEFAULTS } from '../lib/core.js';

function keyFromDsh() {
  try {
    const text = fs.readFileSync(path.join(os.homedir(), '.dsh', '.credentials.yaml'), 'utf8');
    // 取本插件自己存的第一个引用名（IMAGE_STUDIO_KEY_*）
    return text.match(/IMAGE_STUDIO_KEY_[A-Z0-9_]+:\s*"?([^"\s]+)"?/)?.[1];
  } catch {
    return undefined;
  }
}

const apiKey = process.env.TEST_API_KEY || keyFromDsh();
const baseUrl = process.env.TEST_BASE_URL;
if (!baseUrl) {
  console.log('未设置 TEST_BASE_URL，跳过真实接口测试');
  process.exit(0);
}

console.log('key present:', Boolean(apiKey));

const models = await listModels({ baseUrl, apiKey });
console.log('listModels:', models.ok ? `${models.models.length} 个（来源 ${models.source}）` : `${models.code}: ${models.message}`);

const conn = await testConnection({ baseUrl, apiKey, model: 'gpt-image-2.6-sunburst' });
console.log('testConnection:', conn.ok ? `${conn.latencyMs}ms / ${conn.modelsCount} 个模型` : `${conn.code}: ${conn.message}`);

// 不给 outDir / fallbackOutDir 时应明确报错，而不是写到一个硬编码目录
const noDir = await generateImages({ baseUrl, apiKey, model: 'gpt-image-2.6-sunburst' }, { prompt: 'x' }, { fs, path });
console.log('missing outDir ->', noDir.ok, noDir.code);

console.log('DEFAULTS.outDirRelative:', DEFAULTS.outDirRelative);
