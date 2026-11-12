/**
 * 插件自己的配置存储：多套「图片服务配置」，其中一套为当前使用。
 *
 * 落盘在 $DSH_HOME/dsh-image-studio/config.json，形如：
 * {
 *   "version": 1,
 *   "activeId": "p-ab12cd",
 *   "profiles": [
 *     { "id": "p-ab12cd", "name": "生产网关", "baseUrl": "", "model": "",
 *       "outDir": "", "apiKeyRef": "IMAGE_STUDIO_KEY_P_AB12CD" }
 *   ]
 * }
 *
 * 全新安装时没有任何配置（profiles 为空），也不会自动创建默认项。
 * API Key 本身不进这个文件，只存引用名（值在 $DSH_HOME/.credentials.yaml）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** DSH 家目录：优先环境变量，其次 ~/.dsh。 */
export function dshHome() {
  const fromEnv = process.env.DSH_HOME;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  return path.join(os.homedir(), '.dsh');
}

export function storeFile() {
  return path.join(dshHome(), 'dsh-image-studio', 'config.json');
}

/** 规整一条配置，补默认值、去掉多余字段。 */
export function normalizeProfile(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : `p-${Math.random().toString(16).slice(2, 10)}`;
  return {
    id,
    name: typeof source.name === 'string' ? source.name : '',
    baseUrl: typeof source.baseUrl === 'string' ? source.baseUrl.trim() : '',
    model: typeof source.model === 'string' ? source.model.trim() : '',
    outDir: typeof source.outDir === 'string' ? source.outDir.trim() : '',
    apiKeyRef: typeof source.apiKeyRef === 'string' && source.apiKeyRef.trim()
      ? source.apiKeyRef.trim()
      : `IMAGE_STUDIO_KEY_${id.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase()}`,
  };
}

/** 空状态：没有任何配置。 */
function emptyState() {
  return { version: 1, activeId: '', profiles: [] };
}

/** 读配置；文件不存在或损坏时返回空状态（不写盘）。 */
export function loadState() {
  try {
    const text = fs.readFileSync(storeFile(), 'utf8');
    const parsed = JSON.parse(text);
    const profiles = Array.isArray(parsed?.profiles) ? parsed.profiles.map(normalizeProfile) : [];
    if (!profiles.length) return emptyState();
    const activeId = profiles.some((p) => p.id === parsed?.activeId) ? parsed.activeId : profiles[0].id;
    return { version: 1, activeId, profiles };
  } catch {
    return emptyState();
  }
}

/** 写配置（原子替换）。允许保存空列表。 */
export function saveState(next) {
  const profiles = Array.isArray(next?.profiles) ? next.profiles.map(normalizeProfile) : [];
  const activeId = profiles.length
    ? (profiles.some((p) => p.id === next?.activeId) ? next.activeId : profiles[0].id)
    : '';
  const state = { version: 1, activeId, profiles };
  const file = storeFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return state;
}

/** 取当前生效的配置；没有任何配置时返回 undefined。 */
export function activeProfile(state = loadState()) {
  if (!state.profiles.length) return undefined;
  return state.profiles.find((p) => p.id === state.activeId) ?? state.profiles[0];
}
