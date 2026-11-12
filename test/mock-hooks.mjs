const MAP = {
  '@deepseek-ai/schemastery': new URL('./shims/schemastery.mjs', import.meta.url).href,
  '@deepseek-ai/dsh-tools': new URL('./shims/dsh-tools.mjs', import.meta.url).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (MAP[specifier]) return { url: MAP[specifier], shortCircuit: true, format: 'module' };
  return nextResolve(specifier, context);
}
