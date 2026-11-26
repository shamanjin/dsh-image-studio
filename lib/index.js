/**
 * dsh-image-studio — 宿主半侧（cordis 插件）
 *
 * 职责：
 *   1. 维护「多套图片服务配置」，其中一套是当前使用（存 $DSH_HOME/dsh-image-studio/config.json）
 *   2. 注册 image_generate 工具，让模型可以直接出图
 *   3. 注册 /dsh-image-studio/* 路由，供设置页拉模型、测连接、读写配置
 *
 * 密钥不进配置文件：只存引用名，真值走 credentials seam（$DSH_HOME/.credentials.yaml）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { DEFAULTS, editImages, generateImages, listModels, testConnection } from './core.js';
import { activeProfile, loadState, saveState, storeFile } from './store.js';

/** Cordis 插件名（Loader 诊断用）。 */
export const name = 'image-studio';

/** 依赖的宿主服务。 */
export const inject = ['tools', 'webServer', 'credentials'];

const ROUTE_PREFIX = '/dsh-image-studio';
const MAX_BODY_BYTES = 64 * 1024;

/**
 * 解析「当前工作目录」：优先会话自己的目录，其次插件的默认目录，最后进程 cwd。
 * @param {{workingDirectory?: any}} env
 * @param {{agent?: {session?: any}}} [exec]
 */
function baseDirectory(env, exec) {
  try {
    const session = exec && exec.agent ? exec.agent.session : undefined;
    const service = env.workingDirectory;
    if (service && session) {
      const dir = service.get(session);
      if (typeof dir === 'string' && dir.trim()) return dir;
    }
  } catch {
    /* 回落到下一个来源 */
  }
  try {
    const fallback = env.workingDirectory && env.workingDirectory.defaultDirectory;
    if (typeof fallback === 'string' && fallback.trim()) return fallback;
  } catch {
    /* 回落到进程目录 */
  }
  return process.cwd();
}

/** 未配置输出目录时的默认值：<工作目录>/dsh_outputs/images。 */
function defaultOutDir(env, exec) {
  return path.join(baseDirectory(env, exec), ...DEFAULTS.outDirRelative.split('/'));
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) throw new Error('请求体过大');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/** 解析某个引用名背后的密钥。 */
async function resolveKey(ctx, ref) {
  if (!ref) return undefined;
  try {
    const hit = await ctx.credentials.resolve(ref);
    return hit?.value;
  } catch {
    return process.env[ref];
  }
}

/** 把配置列表补上「是否已配置密钥」这类只在宿主侧知道的信息。 */
async function describeState(ctx, env) {
  const state = loadState();
  const refs = [...new Set(state.profiles.map((profile) => profile.apiKeyRef))];
  // Host 的 credentials.describe(ref) 一次只接受一个引用名，返回 {configured, source?, writable}
  const keyInfo = {};
  for (const ref of refs) {
    try {
      const info = await ctx.credentials.describe(ref);
      keyInfo[ref] = {
        configured: info?.configured === true,
        writable: info?.writable !== false,
        source: info?.source,
      };
    } catch {
      keyInfo[ref] = { configured: false, writable: true };
    }
  }
  return {
    activeId: state.activeId,
    profiles: state.profiles.map((profile) => {
      const info = keyInfo[profile.apiKeyRef] ?? { configured: false, writable: true };
      return {
        ...profile,
        hasKey: info.configured,
        keyWritable: info.writable,
      };
    }),
    storeFile: storeFile(),
    defaults: { outDir: defaultOutDir(env), size: DEFAULTS.size },
  };
}

let allowedHostsCache = null;

/** 本机允许的 Host 列表（来自实际监听的端口），用于拦截 DNS rebinding。 */
function allowedHosts(ctx) {
  if (allowedHostsCache && allowedHostsCache.size) return allowedHostsCache;
  const hosts = new Set();
  try {
    const origin = ctx.webServer.getOrigin();
    if (origin) hosts.add(new URL(origin).host.toLowerCase());
  } catch {
    /* 端口还没绑定 */
  }
  try {
    const port = ctx.webServer.port;
    if (port) {
      hosts.add(`127.0.0.1:${port}`);
      hosts.add(`localhost:${port}`);
      hosts.add(`[::1]:${port}`);
    }
  } catch {
    /* 读不到端口就只依赖 getOrigin */
  }
  if (hosts.size) allowedHostsCache = hosts;
  return hosts;
}

/**
 * 挡住来自网页的跨站调用，两层：
 *
 * 1. 平台标准检查（首选）：ctx.connection.requestRejection(req)
 *    - Host/Origin 围栏 + 必须是已认证的会话，拒绝时返回 401/403
 *    - 只有 web 组合才提供该服务；缺失时退回第 2 层
 * 2. 本地兜底（服务缺失或老版本时）：
 *    - Host 必须是本机实际监听的地址（防 DNS rebinding）
 *    - 带 Origin 时必须是同源
 *    - Sec-Fetch-Site 不能是 cross-site
 *    - POST 必须是 application/json（挡表单型 CSRF）
 */
function rejectUnsafeRequest(ctx, req, res, env) {
  // 1) 平台检查
  const connection = env?.connection;
  if (connection && typeof connection.requestRejection === 'function') {
    let rejection;
    try {
      rejection = connection.requestRejection(req);
    } catch {
      rejection = 403;
    }
    if (rejection) {
      sendJson(res, rejection, {
        ok: false,
        code: rejection === 401 ? 'unauthorized' : 'forbidden',
        message: rejection === 401
          ? '需要已认证的 DSH 会话'
          : '仅允许本机同源的已认证请求',
      });
      return true;
    }
  }

  // 2) 本地兜底
  const host = String(req.headers.host || '').toLowerCase();
  const allowed = allowedHosts(ctx);
  if (allowed.size && !allowed.has(host)) {
    sendJson(res, 403, { ok: false, code: 'forbidden_host', message: '仅允许本机访问' });
    return true;
  }

  const site = String(req.headers['sec-fetch-site'] || '');
  if (site && site !== 'same-origin' && site !== 'none') {
    sendJson(res, 403, { ok: false, code: 'forbidden_origin', message: '不允许跨站调用' });
    return true;
  }

  const origin = req.headers.origin;
  if (origin) {
    let originHost = '';
    try {
      originHost = new URL(String(origin)).host.toLowerCase();
    } catch {
      originHost = '';
    }
    if (originHost !== host) {
      sendJson(res, 403, { ok: false, code: 'forbidden_origin', message: '不允许跨站调用' });
      return true;
    }
  }

  if ((req.method ?? 'GET') === 'POST') {
    const type = String(req.headers['content-type'] || '');
    if (!/^application\/json\b/i.test(type)) {
      sendJson(res, 415, { ok: false, code: 'unsupported_media_type', message: '只接受 application/json' });
      return true;
    }
  }

  return false;
}

function applyRoutes(ctx, env) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    async handler(req, res) {
      if (rejectUnsafeRequest(ctx, req, res, env)) return;

      const url = new URL(req.url ?? '/', 'http://localhost');
      const sub = url.pathname.slice(ROUTE_PREFIX.length) || '/';
      const method = req.method ?? 'GET';

      try {
        if (sub === '/state' && (method === 'GET' || method === 'HEAD')) {
          return sendJson(res, 200, { ok: true, ...(await describeState(ctx, env)) });
        }

        if (sub === '/state' && method === 'POST') {
          const body = await readJsonBody(req);
          try {
            saveState({ profiles: body?.profiles, activeId: body?.activeId });
          } catch (error) {
            return sendJson(res, 400, { ok: false, code: 'invalid', message: error?.message ?? String(error) });
          }
          return sendJson(res, 200, { ok: true, ...(await describeState(ctx, env)) });
        }

        if (sub === '/models' || sub === '/test') {
          const body = method === 'POST' ? await readJsonBody(req) : {};
          const baseUrl = String(body?.baseUrl ?? '').trim();
          const apiKey = body?.apiKey ? String(body.apiKey).trim() : await resolveKey(ctx, body?.apiKeyRef);
          const cfg = { baseUrl, apiKey, model: body?.model };
          const result = sub === '/models' ? await listModels(cfg) : await testConnection(cfg);
          return sendJson(res, result.ok ? 200 : 502, result);
        }

        if (sub === '/generate' && method === 'POST') {
          const body = await readJsonBody(req);
          const state = loadState();
          const profile = body?.profileId
            ? state.profiles.find((p) => p.id === body.profileId) ?? activeProfile(state)
            : activeProfile(state);
          if (!profile) {
            return sendJson(res, 400, { ok: false, code: 'no_profile', message: '尚未添加生图配置' });
          }
          const apiKey = await resolveKey(ctx, profile.apiKeyRef);
          const images = Array.isArray(body?.images) ? body.images : (body?.image ? [body.image] : []);
          const run = images.length ? editImages : generateImages;
          const result = await run(
            { ...profile, apiKey, timeoutMs: DEFAULTS.timeoutMs, fallbackOutDir: defaultOutDir(env) },
            body,
            { fs, path },
          );
          return sendJson(res, result.ok ? 200 : 502, result);
        }

        return sendJson(res, 404, { ok: false, code: 'not_found', message: `未知接口 ${sub}` });
      } catch (error) {
        return sendJson(res, 500, { ok: false, code: 'internal', message: error?.message ?? String(error) });
      }
    },
  }), 'image-studio: routes');
}

function applyTool(ctx, env) {
  ctx.tools.register(defineTool({
    name: 'image_generate',
    description: '用当前配置的生图服务（OpenAI 兼容接口）生成或编辑图片并保存到本地，返回图片绝对路径。只给 prompt 是文生图；同时给 images（参考图路径或 URL）就是图生图／图片编辑。适合画插图、海报、封面、头像、风格图、按参考图改风格与改内容等。',
    parameters: {
      prompt: {
        type: 'string',
        required: true,
        description: '图片描述。图生图时写「基于参考图改成什么」，需要无文字时明确写「不要文字」。',
      },
      images: {
        type: 'array',
        items: { type: 'string' },
        description: '参考图列表，每项是本地绝对路径或 http(s) URL。传了就按图生图处理，可传多张。',
      },
      mask: { type: 'string', description: '可选，局部重绘的遮罩图路径或 URL（需要模型支持）' },
      model: { type: 'string', description: '已废弃：模型固定使用当前选中配置里的模型，传了也会被忽略' },
      size: { type: 'string', description: '尺寸，例如 1024x1024、1536x1024（横版）、1024x1536（竖版）' },
      quality: { type: 'string', description: '质量 low / medium / high / auto（模型支持时才生效）' },
      n: { type: 'number', description: '生成张数，默认 1，最多 10' },
      outDir: { type: 'string', description: '已废弃：保存目录固定跟随当前配置（未配置时用工作目录下的 dsh_outputs/images），传了也会被忽略' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          files: { type: 'array', items: { type: 'string' }, required: true },
          model: { type: 'string' },
          size: { type: 'string' },
          dir: { type: 'string' },
          count: { type: 'number', required: true },
          elapsedMs: { type: 'number' },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.ok
          ? [
              `已生成 ${value.count} 张图片（模型 ${value.model || '默认'}${value.size ? `，${value.size}` : ''}）`,
              value.dir ? `保存目录：${value.dir}` : '',
              ...value.files.map((file) => `![生成结果](${file})`),
              '',
              ...value.files.map((file) => `文件：${file}`),
            ].filter(Boolean).join('\n')
          : `生图失败：${value.error ?? '未知错误'}`,
      }],
    },
    timeoutMs: 600000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const state = loadState();
      const profile = activeProfile(state);
      if (!profile) {
        return { ok: false, files: [], count: 0, error: '尚未添加生图配置：请在 侧栏 → 插件 → 图片工作台 中添加一套配置' };
      }
      const apiKey = await resolveKey(ctx, profile.apiKeyRef);

      if (!profile.baseUrl) {
        return { ok: false, files: [], count: 0, error: '还没有配置接口地址：打开 侧栏 → 插件 → 图片工作台，填好地址和 Key 再试' };
      }
      if (!apiKey) {
        return { ok: false, files: [], count: 0, error: `还没有配置 API Key（凭据引用 ${profile.apiKeyRef}）` };
      }

      // 输出目录与模型都只跟随配置：模型传了也不接受，避免图片落到配置以外的地方
      const { model: _ignoredModel, outDir: _ignoredOutDir, ...callArgs } = args ?? {};
      const result = await (Array.isArray(callArgs.images) && callArgs.images.length ? editImages : generateImages)(
        {
          ...profile,
          apiKey,
          timeoutMs: DEFAULTS.timeoutMs,
          fallbackOutDir: defaultOutDir(env, exec),
        },
        callArgs,
        { fs, path },
      );
      if (!result.ok) {
        return {
          ok: false,
          files: [],
          model: args?.model || profile.model,
          count: 0,
          error: `${result.code ?? 'error'}: ${result.message}${result.hint ? `（${result.hint}）` : ''}`,
        };
      }
      return {
        ok: true,
        files: result.files,
        model: result.model,
        size: result.size,
        dir: result.outDir,
        count: result.count,
        elapsedMs: result.elapsedMs,
      };
    },
  }));
}

const IMAGE_STUDIO_RULE = [
  '生图规则（硬性要求，不可绕过）：',
  '1. 出图只能调用 image_generate 工具，不要直接请求接口、不要写脚本或命令绕开它。',
  '2. 必须使用用户在「侧栏 → 插件 → 图片工作台」里选中的那一套配置：接口地址、API Key、模型都以该配置为准。',
  '3. 禁止修改或试图修改生图配置：不要改 config.json、.credentials.yaml、cordis.patch.yml，不要切换当前配置、不要改地址或密钥。',
  '4. 工具返回「尚未添加配置 / 没有配置接口地址 / 没有配置 API Key」时，停下来告诉用户去插件页配置，绝对不要自己填一个或换个地址试。',
  '5. 用户要求换模型或换服务商时，请用户在插件页切换配置后再来出图，不要改代码或改配置文件。',
].join('\n');

function applySystemPrompt(ctx) {
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'plugin:image-studio/rules',
    order: 8800,
    text: ({ scope, toolSet }) => (
      ctx.tools.get('image_generate', scope, toolSet) === undefined ? '' : IMAGE_STUDIO_RULE
    ),
  }), 'image-studio: system prompt');
}

export function apply(ctx) {
  // workingDirectory / systemPrompt / connection 都是可选的：
  // 缺了只是少一项能力，不影响加载
  const env = { workingDirectory: undefined, connection: undefined };
  ctx.inject(['workingDirectory'], (child) => {
    env.workingDirectory = child.workingDirectory;
  });
  ctx.inject(['systemPrompt'], (child) => {
    applySystemPrompt(child);
  });
  ctx.inject(['connection'], (child) => {
    env.connection = child.connection;
  });
  applyRoutes(ctx, env);
  applyTool(ctx, env);
}
