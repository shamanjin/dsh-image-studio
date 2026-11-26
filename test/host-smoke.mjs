import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 用临时 DSH_HOME，避免动到真实配置
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-image-studio-'));
process.env.DSH_HOME = tmpHome;

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

const tools = [];
const routes = [];
const sections = [];

// 模拟工作目录服务：返回一个可预测的目录
const WORKDIR = path.join(os.tmpdir(), 'dsh-image-studio-workdir');

// cordis 子上下文会继承父级的服务，这里同样继承 effect / tools
const shared = {
  effect(fn) { const d = fn(); return () => (typeof d === 'function' ? d() : undefined); },
  tools: { register: (t) => { tools.push(t); return () => {}; }, get: () => undefined },
};

const ctx = {
  ...shared,
  inject(services, callback) {
    const child = { ...shared };
    if (services.includes('workingDirectory')) {
      child.workingDirectory = { get: () => WORKDIR, defaultDirectory: WORKDIR };
    }
    if (services.includes('systemPrompt')) {
      child.systemPrompt = {
        section: (definition) => {
          sections.push(definition);
          return () => {};
        },
      };
    }
    if (services.includes('connection')) {
      // 模拟平台访问检查：host 是 evil 或 origin 跨站 → 403；没有会话头 → 401
      child.connection = {
        requestRejection(request) {
          const host = String(request.headers?.host || '');
          if (host.startsWith('evil.')) return 403;
          if (request.headers?.origin && !String(request.headers.origin).includes('127.0.0.1')) return 403;
          if (request.headers?.['x-test-session'] === 'none') return 401;
          return undefined;
        },
      };
    }
    callback(child);
    return () => {};
  },
  webServer: {
    register: (r) => { routes.push(r); return () => {}; },
    getOrigin: () => 'http://127.0.0.1:12345',
    port: 12345,
  },
  credentials: {
    async resolve(ref) {
      return apiKey ? { value: apiKey, source: 'test' } : undefined;
    },
    // Host 侧签名：describe(ref) 单个引用名 → {configured, source?, writable}
    async describe(ref) {
      if (Array.isArray(ref)) throw new Error('describe 只接受单个引用名');
      return { configured: Boolean(apiKey), writable: true, source: 'test' };
    },
  },
};

const mod = await import('../lib/index.js');
console.log('exports:', Object.keys(mod).join(', '), '| inject:', JSON.stringify(mod.inject));

mod.apply(ctx);
console.log('routes:', routes.map((r) => `${r.kind} ${r.path}`).join(', '));
console.log('tools:', tools.map((t) => t.name).join(', '));
console.log('prompt sections:', sections.map((s) => `${s.name}@${s.order}`).join(', ') || '(none)');

const route = routes[0];

async function call(method, url, body, options = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const headers = {
    host: options.host ?? '127.0.0.1:12345',
    ...(body === undefined ? {} : { 'content-type': options.contentType ?? 'application/json' }),
    ...(options.origin === undefined ? {} : { origin: options.origin }),
    ...(options.site === undefined ? {} : { 'sec-fetch-site': options.site }),
    ...(options.session === undefined ? {} : { 'x-test-session': options.session }),
  };
  const req = {
    method,
    url,
    headers,
    async *[Symbol.asyncIterator]() { for (const c of chunks) yield c; },
  };
  let status = 0;
  let payload = null;
  const res = {
    writeHead(code) { status = code; },
    end(buf) { payload = JSON.parse(buf.toString('utf8')); },
  };
  await route.handler(req, res);
  return { status, payload };
}

const initial = await call('GET', '/dsh-image-studio/state');
console.log('GET /state ->', initial.status, 'profiles:', initial.payload.profiles?.length,
  '| baseUrl:', JSON.stringify(initial.payload.profiles?.[0]?.baseUrl));

const profile = {
  id: 'p-test',
  name: '测试网关',
  baseUrl: process.env.TEST_BASE_URL || 'https://api.example.com/v1',
  model: 'gpt-image-2.6-sunburst',
  outDir: path.join(WORKDIR, 'out'),
  apiKeyRef: 'TEST_KEY_REF',
};

const saved = await call('POST', '/dsh-image-studio/state', { profiles: [profile], activeId: profile.id });
console.log('POST /state ->', saved.status, 'ok:', saved.payload.ok, '| store:', saved.payload.storeFile);
console.log('default outDir ->', saved.payload.defaults?.outDir);
console.log('expected       ->', path.join(WORKDIR, 'dsh_outputs', 'images'));
console.log('hasKey reported ->', saved.payload.profiles?.[0]?.hasKey, '(应为 true)');

const models = await call('POST', '/dsh-image-studio/models', { baseUrl: profile.baseUrl, apiKeyRef: profile.apiKeyRef });
console.log('POST /models ->', models.status, 'ok:', models.payload.ok, 'count:', models.payload.models?.length,
  '| first:', models.payload.models?.[0]?.id);

// ---- 安全检查：平台层（ctx.connection.requestRejection）----
const platformHost = await call('GET', '/dsh-image-studio/state', undefined, { host: 'evil.rebind.example:12345' });
const platformOrigin = await call('POST', '/dsh-image-studio/state', { profiles: [] }, { origin: 'https://evil.example' });
const platformNoSession = await call('GET', '/dsh-image-studio/state', undefined, { session: 'none' });

// ---- 安全检查：兜底层（平台服务缺失时的自定义校验）----
const crossSite = await call('POST', '/dsh-image-studio/state', { profiles: [] }, { site: 'cross-site' });
const plainText = await call('POST', '/dsh-image-studio/state', { profiles: [] }, { contentType: 'text/plain' });
const sameOrigin = await call('POST', '/dsh-image-studio/state', { profiles: [profile], activeId: profile.id }, { origin: 'http://127.0.0.1:12345' });

const problems = [];
if (platformHost.status !== 403) problems.push(`平台 Host 围栏未生效（${platformHost.status}）`);
if (platformOrigin.status !== 403) problems.push(`平台 Origin 围栏未生效（${platformOrigin.status}）`);
if (platformNoSession.status !== 401) problems.push(`未认证会话未被拒（${platformNoSession.status}）`);
if (crossSite.status !== 403) problems.push(`cross-site 未被拒（${crossSite.status}）`);
if (plainText.status !== 415) problems.push(`非 JSON POST 未被拒（${plainText.status}）`);
if (sameOrigin.status !== 200) problems.push(`同源请求被误拒（${sameOrigin.status}）`);
console.log('安全校验 ->', problems.length
  ? 'PROBLEMS: ' + problems.join('; ')
  : '平台 403/403/401 + 兜底 403/415/同源 200 全部符合预期');

const test = await call('POST', '/dsh-image-studio/test', { baseUrl: profile.baseUrl, model: profile.model, apiKeyRef: profile.apiKeyRef });
console.log('POST /test ->', test.status, JSON.stringify(test.payload));

const gen = tools[0];
console.log('tool schema params:', Object.keys(gen.parameters).join(', '));

fs.rmSync(tmpHome, { recursive: true, force: true });
