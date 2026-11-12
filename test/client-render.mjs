/**
 * 浏览器半侧的渲染自测：最小 React 替身 + 假 fetch，
 * 验证「配置方块 → 点添加弹窗 → 保存」这条链路，并检查关键控件与文案。
 */

// ---------- 最小 React 替身（支持重渲染） ----------
let hookIndex = 0;
let hookStates = [];
let effectQueue = [];
let effectRan = new Set();
let needsRender = false;

const fakeReact = {
  createElement(tag, props, ...children) {
    return {
      tag,
      props: props || {},
      children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false),
    };
  },
  useState(initial) {
    const index = hookIndex++;
    if (!(index in hookStates)) hookStates[index] = typeof initial === 'function' ? initial() : initial;
    const setter = (value) => {
      const next = typeof value === 'function' ? value(hookStates[index]) : value;
      if (next !== hookStates[index]) {
        hookStates[index] = next;
        needsRender = true;
      }
    };
    return [hookStates[index], setter];
  },
  useEffect(fn) {
    const index = hookIndex++;
    if (!effectRan.has(index)) {
      effectRan.add(index);
      effectQueue.push(fn);
    }
  },
  useCallback(fn) {
    return fn;
  },
  useMemo(fn) {
    return fn();
  },
};

// ---------- 捕获模块注册 ----------
const captured = { module: null, registration: null };
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      captured.module = definition.factory((specifier) => {
        if (specifier === 'react') return fakeReact;
        if (specifier === '@deepseek-ai/dsh-client-ui-primitives') {
          return {
            Button: (props) => fakeReact.createElement('button', props, props.children),
            Tag: (props) => fakeReact.createElement('span', { className: 'tag' }, props.children),
            Modal: (props) => (props.open
              ? fakeReact.createElement('div', { className: 'modal' }, props.children, props.footer)
              : null),
          };
        }
        throw new Error('unexpected require: ' + specifier);
      });
    },
  },
};

// ---------- 假 fetch ----------
const calls = [];
const state = {
  ok: true,
  activeId: 'p-a',
  profiles: [
    { id: 'p-a', name: '生产网关', baseUrl: 'https://api.example.com/v1', model: 'gpt-image-2.6-sunburst', outDir: '', apiKeyRef: 'K1', hasKey: true, keyWritable: true },
    { id: 'p-b', name: '备用服务', baseUrl: '', model: '', outDir: '', apiKeyRef: 'K2', hasKey: false, keyWritable: true },
  ],
};

globalThis.fetch = async (url, init) => {
  calls.push({ url, body: init?.body });
  const payload = init?.body ? JSON.parse(init.body) : null;
  if (url.endsWith('/state') && !payload) return { ok: true, status: 200, json: async () => state };
  if (url.endsWith('/state') && payload) {
    state.profiles = payload.profiles;
    state.activeId = payload.activeId;
    return { ok: true, status: 200, json: async () => state };
  }
  return { ok: true, status: 200, json: async () => ({ ok: true }) };
};

await import('../lib/client.js');

// ---------- 挂载 ----------
const slotCtx = {
  effect(fn) {
    const disposer = fn();
    return typeof disposer === 'function' ? disposer : () => {};
  },
  locale: { bind: () => (key) => key, register: () => {} },
  slots: {
    inject(_name, callback) {
      callback();
      return () => {};
    },
    register(definition, component) {
      captured.registration = { definition, component };
      return () => {};
    },
  },
  remote: { credentials: { set: async () => ({ ok: true }) } },
};
captured.module.apply(slotCtx);

const { definition, component } = captured.registration;
const props = { t: (key) => key, view: 'form', ...definition.inject() };

let tree = null;

function paint() {
  for (let round = 0; round < 8; round += 1) {
    needsRender = false;
    hookIndex = 0;
    tree = component(props);
    const pending = effectQueue;
    effectQueue = [];
    for (const fn of pending) fn();
    if (!needsRender) break;
  }
  return tree;
}

async function settle() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  paint();
}

function walk(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out);
    return out;
  }
  out.push(node);
  // 展开 Button / Tag / Modal 等函数组件，让断言看到真正渲染的结构
  if (typeof node.tag === 'function') {
    walk(node.tag({ ...node.props, children: node.children }), out);
    return out;
  }
  for (const child of node.children || []) walk(child, out);
  return out;
}

const textOf = (node) => (node.children || []).filter((c) => typeof c === 'string').join('');
const hasClass = (node, name) => String(node.props.className || '').includes(name);

paint();
await settle();
let nodes = walk(tree);

const tiles = nodes.filter((n) => /^dshig_tile(\s|$)/.test(String(n.props.className || '')) && !hasClass(n, 'dshig_tile_add'));
const addTile = nodes.find((n) => hasClass(n, 'dshig_tile_add'));
console.log('tiles:', tiles.length, '| names:', JSON.stringify(nodes.filter((n) => String(n.props.className || '') === 'dshig_tile_name').map(textOf)));
console.log('active highlighted:', tiles.some((n) => hasClass(n, 'dshig_tile_active')));

// ---------- 打开弹窗 ----------
addTile.props.onClick();
await settle();
nodes = walk(tree);
const modal = nodes.find((n) => String(n.props.className || '') === 'modal');
const inputs = nodes.filter((n) => n.tag === 'input');
const modalButtons = nodes.filter((n) => n.tag === 'button').map(textOf);
console.log('modal open:', Boolean(modal), '| inputs:', inputs.length, '| buttons:', JSON.stringify(modalButtons));

// ---------- 保存 ----------
const saveButton = nodes.find((n) => n.tag === 'button' && hasClass(n, 'dshig_primary'));
const before = calls.length;
await saveButton.props.onClick();
await settle();
const posted = calls.slice(before).find((c) => c.body);
console.log('POST /state sent:', Boolean(posted), '| profiles after save:', posted ? JSON.parse(posted.body).profiles.length : 0);
console.log('modal closed after save:', !walk(tree).some((n) => String(n.props.className || '') === 'modal'));

const problems = [];
if (tiles.length !== 2) problems.push('方块数量不对');
if (!tiles.some((n) => hasClass(n, 'dshig_tile_active'))) problems.push('没有高亮当前使用');
if (!addTile) problems.push('缺少添加方块');
if (!modal) problems.push('点添加没有弹出弹窗');
if (inputs.length < 5) problems.push('弹窗字段不全');
if (!posted) problems.push('保存没有发出请求');
if (walk(tree).some((n) => String(n.props.className || '') === 'modal')) problems.push('保存后弹窗没关');
if (!modalButtons.includes('fetchModels')) problems.push('弹窗里没有获取模型按钮');
if (modalButtons.includes('saveKey')) problems.push('仍有独立的保存密钥按钮');
console.log(problems.length ? 'PROBLEMS: ' + problems.join('; ') : '方块 → 弹窗 → 保存 链路通过');
