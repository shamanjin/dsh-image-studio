/**
 * 与 DSH 无关的纯 Node 实现：调用 OpenAI 兼容的图片接口。
 * 宿主半侧（lib/index.js）与命令行脚本共用这里的逻辑。
 *
 * 设计要点：
 *   - 没有任何写死的站点/模型：地址、密钥、模型全部由调用方传入
 *   - 拉模型优先用「该 Key 能看到的模型列表」（{base}/models），
 *     失败再退回 new-api 类站点的公开定价接口（/api/pricing）
 */

export const DEFAULTS = {
  size: '1024x1024',
  timeoutMs: 300000,
  /** 相对工作目录的默认出图目录；没有任何配置时用它。 */
  outDirRelative: 'dsh_outputs/images',
};

/** 判断一个模型名是否像生图模型。 */
export function looksLikeImageModel(id) {
  const text = String(id || '');
  if (!text) return false;
  if (/image|dall-?e|midjourney|^mj[-_]|flux|seedream|kling|sora[-_]?image|imagen|recraft|ideogram|stable-?diffusion|sd3|kolors|hunyuan-?image|qwen-?image|wanx|doubao-?seedream|grok-?image|nano[-_]?banana/i.test(text)) return true;
  return false;
}

function normalizeBase(baseUrl) {
  const url = String(baseUrl || '').trim().replace(/\/+$/, '');
  return url;
}

async function withTimeout(fn, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(res) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

/** 把接口返回的英文报错收敛成中文，原始信息保留在 detail 里。 */
function chineseMessage(status, message) {
  const text = String(message || '');
  if (/no available channel|model_not_found|无可用渠道/i.test(text)) return '该 API Key 所在分组没有此模型的访问权限';
  if (/invalid api key|incorrect api key|unauthorized|无效的令牌/i.test(text)) return 'API Key 无效或已失效';
  if (/insufficient|quota|balance|余额|额度/i.test(text)) return '账户额度不足';
  if (/rate limit|too many requests|频率/i.test(text)) return '请求过于频繁，请稍后重试';
  if (/not found|no such model/i.test(text)) return '模型不存在，请检查模型 ID';
  if (status === 401) return 'API Key 无效或已失效';
  if (status === 403) return '没有访问该资源的权限';
  if (status === 404) return '接口地址不存在，请确认是否填写到 /v1 层级';
  if (status === 429) return '请求过于频繁，请稍后重试';
  if (status >= 500) return '服务端错误，请稍后重试';
  if (status >= 400) return '请求被拒绝，请检查地址与参数';
  return '请求失败';
}

function errorFrom(res, json, text) {
  const err = json?.error ?? {};
  const code = err.code ?? err.type ?? (res?.status ? `http_${res.status}` : 'unknown');
  const detail = err.message ?? (text ? String(text).slice(0, 400) : '');
  return { ok: false, status: res?.status, code, message: chineseMessage(res?.status, detail), detail };
}

function sortModels(models) {
  return models.slice().sort((a, b) => {
    if (a.image !== b.image) return a.image ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
  });
}

/**
 * 拉取可用模型。
 * @param {{baseUrl:string, apiKey?:string, timeoutMs?:number}} cfg
 * @returns {Promise<{ok:boolean, source?:string, models?:Array<{id:string,image:boolean}>, message?:string}>}
 */
export async function listModels(cfg = {}) {
  const base = normalizeBase(cfg.baseUrl);
  const timeoutMs = Number(cfg.timeoutMs) > 0 ? Number(cfg.timeoutMs) : 30000;
  if (!base) return { ok: false, code: 'no_base', message: '请先填写接口地址' };
  if (!cfg.apiKey) return { ok: false, code: 'no_key', message: '请先填写或保存 API Key' };

  // 1) 标准 OpenAI 兼容接口：只返回这个 Key 真正能用的模型
  try {
    const res = await withTimeout(
      (signal) => fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: 'application/json' },
        signal,
      }),
      timeoutMs,
    );
    const { json, text } = await readJson(res);
    if (res.ok) {
      const data = Array.isArray(json?.data) ? json.data : (Array.isArray(json?.models) ? json.models : []);
      const models = sortModels(data
        .map((item) => (typeof item === 'string' ? item : item?.id ?? item?.name))
        .filter((id) => typeof id === 'string' && id.length > 0)
        .map((id) => ({ id, image: looksLikeImageModel(id) })));
      if (models.length) return { ok: true, source: 'models', models, all: models.length };
      return { ok: false, code: 'empty', message: '接口返回的模型列表是空的', status: res.status };
    }
    // 401/403 直接报，不必再试定价接口
    if (res.status === 401 || res.status === 403) return errorFrom(res, json, text);
  } catch (error) {
    if (error?.name !== 'AbortError') {
      // 网络层失败，继续尝试定价接口
    }
  }

  // 2) new-api / one-api 类站点的公开定价接口（无需鉴权，带分组与价格）
  const origin = base.replace(/\/v\d+(\.\d+)?$/, '');
  try {
    const res = await withTimeout((signal) => fetch(`${origin}/api/pricing`, { signal }), timeoutMs);
    if (res.ok) {
      const { json } = await readJson(res);
      const data = Array.isArray(json?.data) ? json.data : [];
      const models = sortModels(data
        .map((m) => ({
          id: m.model_name,
          image: (Array.isArray(m.supported_endpoint_types) && m.supported_endpoint_types.includes('image-generation'))
            || looksLikeImageModel(m.model_name),
          price: m.model_price ?? null,
        }))
        .filter((m) => typeof m.id === 'string' && m.id.length > 0));
      if (models.length) return { ok: true, source: 'pricing', models, all: models.length };
    }
  } catch { /* 两种都失败，走下面的统一报错 */ }

  return { ok: false, code: 'unreachable', message: '接口地址连不上，或该地址不支持 /models' };
}

/**
 * 连通性检查：打一次 {base}/models，报延迟、模型数量、目标模型是否可见。
 * @param {{baseUrl:string, apiKey?:string, model?:string, timeoutMs?:number}} cfg
 */
export async function testConnection(cfg = {}) {
  const started = Date.now();
  const base = normalizeBase(cfg.baseUrl);
  if (!base) return { ok: false, code: 'no_base', message: '请先填写接口地址' };
  if (!cfg.apiKey) return { ok: false, code: 'no_key', message: '请先填写或保存 API Key' };
  const timeoutMs = Number(cfg.timeoutMs) > 0 ? Number(cfg.timeoutMs) : 30000;

  try {
    const res = await withTimeout(
      (signal) => fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: 'application/json' },
        signal,
      }),
      timeoutMs,
    );
    const latencyMs = Date.now() - started;
    const { json, text } = await readJson(res);
    if (!res.ok) return { ...errorFrom(res, json, text), latencyMs };

    const data = Array.isArray(json?.data) ? json.data : [];
    const ids = data.map((item) => (typeof item === 'string' ? item : item?.id)).filter(Boolean);
    const target = String(cfg.model || '').trim();
    const modelVisible = target ? ids.includes(target) : undefined;
    return {
      ok: true,
      status: res.status,
      latencyMs,
      modelsCount: ids.length,
      modelVisible,
      note: modelVisible === false ? '模型列表中没有该模型，请确认模型 ID 是否正确' : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      code: error?.name === 'AbortError' ? 'timeout' : 'network',
      message: error?.name === 'AbortError' ? '连接超时，请检查接口地址' : '无法连接到该地址，请检查网络与接口地址',
      latencyMs: Date.now() - started,
    };
  }
}

function slugify(text, fallback = 'image') {
  const cleaned = String(text)
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned || fallback;
}

function stamp() {
  const d = new Date();
  const p = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function extFor(format, url) {
  const map = { png: '.png', jpeg: '.jpg', jpg: '.jpg', webp: '.webp' };
  if (format && map[String(format).toLowerCase()]) return map[String(format).toLowerCase()];
  if (url) {
    const m = String(url).match(/\.(png|jpe?g|webp)(\?|$)/i);
    if (m) return '.' + m[1].toLowerCase().replace('jpeg', 'jpg');
  }
  return '.png';
}

/**
 * 生成图片。
 * @param {{baseUrl:string, apiKey:string, model?:string, outDir?:string, fallbackOutDir?:string, timeoutMs?:number}} cfg
 * @param {{prompt:string, model?:string, size?:string, quality?:string, n?:number,
 *          outDir?:string, name?:string, background?:string, outputFormat?:string}} opts
 * @param {{fs: any, path: any}} io
 */
export async function generateImages(cfg, opts, io) {
  const { fs, path } = io;
  const base = normalizeBase(cfg?.baseUrl);
  if (!base) return { ok: false, code: 'no_base', message: '还没有配置接口地址（插件设置里填一个）' };
  if (!cfg?.apiKey) return { ok: false, code: 'no_key', message: '还没有配置 API Key（插件设置里填一个）' };
  if (!opts?.prompt || !String(opts.prompt).trim()) return { ok: false, code: 'no_prompt', message: '缺少提示词' };

  const model = String(opts.model || cfg.model || '').trim();
  const outDir = String(opts.outDir || cfg.outDir || cfg.fallbackOutDir || '').trim();
  if (!outDir) return { ok: false, code: 'no_out_dir', message: '缺少图片保存目录' };
  const size = opts.size || DEFAULTS.size;
  const count = Math.max(1, Math.min(10, Number(opts.n) || 1));
  const timeoutMs = Number(cfg.timeoutMs) > 0 ? Number(cfg.timeoutMs) : DEFAULTS.timeoutMs;

  const payload = { prompt: String(opts.prompt), n: count, size };
  if (model) payload.model = model;
  if (opts.quality) payload.quality = opts.quality;
  if (opts.background) payload.background = opts.background;
  if (opts.outputFormat) payload.output_format = opts.outputFormat;

  const started = Date.now();
  let res;
  try {
    res = await withTimeout((signal) => fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    }), timeoutMs);
  } catch (error) {
    return {
      ok: false,
      code: error?.name === 'AbortError' ? 'timeout' : 'network',
      message: error?.name === 'AbortError'
        ? `请求超时（${Math.round(timeoutMs / 1000)} 秒）`
        : '无法连接到该地址，请检查网络与接口地址',
    };
  }

  const { json, text } = await readJson(res);
  if (!res.ok) return errorFrom(res, json, text);

  return finishImages(json, { model, size, outDir, started, opts, fs, path });
}

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/** 把参考图取成二进制：支持 http(s) URL 与本地路径。 */
async function loadImageSource(spec, io) {
  const text = String(spec || '').trim();
  if (!text) return { ok: false, message: '参考图为空' };
  if (/^https?:\/\//i.test(text)) {
    const res = await fetch(text);
    if (!res.ok) return { ok: false, message: `下载参考图失败：HTTP ${res.status}` };
    const buffer = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') || 'image/png';
    const ext = type.includes('jpeg') ? '.jpg' : type.includes('webp') ? '.webp' : type.includes('gif') ? '.gif' : '.png';
    return { ok: true, buffer, filename: `source${ext}`, mime: type.split(';')[0] };
  }
  try {
    const buffer = io.fs.readFileSync(text);
    const ext = io.path.extname(text).toLowerCase();
    return { ok: true, buffer, filename: io.path.basename(text) || 'source.png', mime: MIME_BY_EXT[ext] || 'image/png' };
  } catch {
    return { ok: false, message: `读不到参考图：${text}` };
  }
}

/** 保存接口返回的图片（b64 或 url），生成与编辑共用。 */
async function finishImages(json, { model, size, outDir, started, opts, fs, path }) {
  const items = Array.isArray(json?.data) ? json.data : (Array.isArray(json?.images) ? json.images : []);
  if (!items.length) return { ok: false, code: 'empty', message: '响应里没有图片数据' };

  fs.mkdirSync(outDir, { recursive: true });
  const stem = slugify(opts.name || String(opts.prompt));
  const ts = stamp();
  const files = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const suffix = items.length > 1 ? `-${i + 1}` : '';
    const b64 = item?.b64_json ?? item?.b64 ?? item?.base64;
    const url = item?.url ?? item?.image_url ?? item?.imageUrl;
    if (b64) {
      const file = path.join(outDir, `${stem}-${ts}${suffix}${extFor(opts.outputFormat, null)}`);
      fs.writeFileSync(file, Buffer.from(String(b64), 'base64'));
      files.push(path.resolve(file));
    } else if (url) {
      const dl = await fetch(url);
      if (!dl.ok) return { ok: false, code: 'download', message: `下载图片失败：HTTP ${dl.status}` };
      const buf = Buffer.from(await dl.arrayBuffer());
      const file = path.join(outDir, `${stem}-${ts}${suffix}${extFor(opts.outputFormat, String(url))}`);
      fs.writeFileSync(file, buf);
      files.push(path.resolve(file));
    }
  }

  if (!files.length) return { ok: false, code: 'empty', message: '没有可保存的图片' };

  return {
    ok: true,
    model,
    size,
    count: files.length,
    files,
    outDir,
    elapsedMs: Date.now() - started,
    usage: json?.usage,
  };
}

/**
 * 图生图 / 图片编辑：POST {base}/images/edits。
 * 先按 OpenAI 官方形式发 multipart（image 字段），被拒绝时退回 JSON + data URL。
 * @param {{baseUrl:string, apiKey:string, model?:string, outDir?:string, fallbackOutDir?:string, timeoutMs?:number}} cfg
 * @param {{prompt:string, images:string[]|string, model?:string, size?:string, n?:number,
 *          outDir?:string, name?:string, mask?:string, quality?:string}} opts
 * @param {{fs: any, path: any}} io
 */
export async function editImages(cfg, opts, io) {
  const { fs, path } = io;
  const base = normalizeBase(cfg?.baseUrl);
  if (!base) return { ok: false, code: 'no_base', message: '还没有配置接口地址（插件设置里填一个）' };
  if (!cfg?.apiKey) return { ok: false, code: 'no_key', message: '还没有配置 API Key（插件设置里填一个）' };
  if (!opts?.prompt || !String(opts.prompt).trim()) return { ok: false, code: 'no_prompt', message: '缺少提示词' };

  const specs = (Array.isArray(opts.images) ? opts.images : [opts.images]).filter((item) => item && String(item).trim());
  if (!specs.length) return { ok: false, code: 'no_image', message: '缺少参考图' };

  const model = String(opts.model || cfg.model || '').trim();
  const outDir = String(opts.outDir || cfg.outDir || cfg.fallbackOutDir || '').trim();
  if (!outDir) return { ok: false, code: 'no_out_dir', message: '缺少图片保存目录' };
  const size = opts.size || DEFAULTS.size;
  const count = Math.max(1, Math.min(10, Number(opts.n) || 1));
  const timeoutMs = Number(cfg.timeoutMs) > 0 ? Number(cfg.timeoutMs) : DEFAULTS.timeoutMs;

  const loaded = [];
  for (const spec of specs) {
    const image = await loadImageSource(spec, io);
    if (!image.ok) return { ok: false, code: 'bad_image', message: image.message };
    loaded.push(image);
  }

  const started = Date.now();

  // 1) 官方形式：multipart/form-data
  const multipart = async () => {
    const form = new FormData();
    if (model) form.append('model', model);
    form.append('prompt', String(opts.prompt));
    form.append('n', String(count));
    if (size) form.append('size', size);
    if (opts.quality) form.append('quality', opts.quality);
    const field = loaded.length > 1 ? 'image[]' : 'image';
    for (const image of loaded) {
      form.append(field, new Blob([image.buffer], { type: image.mime }), image.filename);
    }
    const mask = opts.mask ? await loadImageSource(opts.mask, io) : undefined;
    if (mask && mask.ok) form.append('mask', new Blob([mask.buffer], { type: mask.mime }), mask.filename);
    return withTimeout((signal) => fetch(`${base}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: form,
      signal,
    }), timeoutMs);
  };

  // 2) 网关常见兜底：JSON + data URL
  const asJson = async () => {
    const payload = {
      model: model || undefined,
      prompt: String(opts.prompt),
      n: count,
      size,
      image: loaded.length === 1
        ? `data:${loaded[0].mime};base64,${loaded[0].buffer.toString('base64')}`
        : loaded.map((image) => `data:${image.mime};base64,${image.buffer.toString('base64')}`),
    };
    if (!payload.model) delete payload.model;
    return withTimeout((signal) => fetch(`${base}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    }), timeoutMs);
  };

  let res;
  let lastError;
  try {
    res = await multipart();
    if (!res.ok && [400, 415, 422, 500].includes(res.status)) {
      const { json, text } = await readJson(res);
      lastError = errorFrom(res, json, text);
      res = await asJson();
    }
  } catch (error) {
    return {
      ok: false,
      code: error?.name === 'AbortError' ? 'timeout' : 'network',
      message: error?.name === 'AbortError'
        ? `请求超时（${Math.round(timeoutMs / 1000)} 秒）`
        : '无法连接到该地址，请检查网络与接口地址',
    };
  }

  const { json, text } = await readJson(res);
  if (!res.ok) {
    const error = errorFrom(res, json, text);
    if (lastError && !/multipart|form/i.test(String(error.detail || ''))) {
      return { ...error, detail: `${lastError.detail || ''} | ${error.detail || ''}`.trim() };
    }
    return error;
  }

  return finishImages(json, { model, size, outDir, started, opts, fs, path });
}
