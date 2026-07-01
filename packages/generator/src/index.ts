// @qa-prism/generator — turns a stack Selection into a runnable framework (spec §6.7).
// Ported from the /generator prototype: template registry + resolve → render → validate.
export { resolve } from './resolve.js';
export { render } from './render.js';
export { validate } from './validate.js';
export { generate, type GenerateResult } from './generate.js';
export { loadRegistry } from './registry.js';
export { zipDir } from './pack.js';
export type { Manifest, RegistryIndex, ResolveResult, Selection } from './types.js';
