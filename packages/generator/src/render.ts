import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Manifest, Selection } from './types.js';

const PARTIALS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'partials');

/** Maps a partial's source path to its destination within the generated project. */
function partialDest(partial: string): string {
  if (partial.startsWith('ci/')) return join('.github', 'workflows', 'e2e.yml');
  return partial.replace(/\.tmpl$/, '');
}

/** Replace every {{token}} in a string using the provided map. */
function substitute(content: string, vars: Record<string, string>): string {
  return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => {
    const value = vars[key];
    return value !== undefined ? value : `{{${key}}}`;
  });
}

/** Recursively collect every file path under a directory. */
async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/** Render a merged dependency map into the ecosystem-specific format. */
function renderDeps(format: string, merged: Record<string, string>): string {
  const keys = Object.keys(merged).sort();
  if (format === 'npm-json') {
    return keys.map((k, i) => `    "${k}": "${merged[k]}"${i < keys.length - 1 ? ',' : ''}`).join('\n');
  }
  if (format === 'pip-lines') {
    // key is the package name, value is the version spec (e.g. ">=8.0,<9").
    return keys.map((k) => `${k}${merged[k]}`).join('\n');
  }
  if (format === 'maven-xml') {
    // key is "groupId:artifactId", value is the version.
    return keys
      .map((k) => {
        const [groupId, artifactId] = k.split(':');
        return [
          '        <dependency>',
          `            <groupId>${groupId}</groupId>`,
          `            <artifactId>${artifactId}</artifactId>`,
          `            <version>${merged[k]}</version>`,
          '            <scope>test</scope>',
          '        </dependency>',
        ].join('\n');
      })
      .join('\n');
  }
  return '';
}

/**
 * Build the variable map the templates render against. Manifest defaults are
 * the base; the user's selection overrides them where provided.
 */
function buildVars(manifest: Manifest, sel: Selection): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, def] of Object.entries(manifest.variables)) {
    vars[key] = def.default;
  }
  if (sel.projectName) vars.projectName = sel.projectName;
  if (sel.webBaseUrl) vars.webBaseUrl = sel.webBaseUrl;
  if (sel.apiBaseUrl) vars.apiBaseUrl = sel.apiBaseUrl;
  vars.reporter = sel.reporter;

  // Merge base deps + the chosen reporter's deps, rendered in the cell's format
  // into the token its build file expects (e.g. {{dependencies}}).
  const merged = { ...manifest.dependencies, ...(manifest.reporterDependencies[sel.reporter] ?? {}) };
  vars[manifest.dependencyRender.token] = renderDeps(manifest.dependencyRender.format, merged);

  // Per-reporter template tokens (config snippets, etc.) resolved at generation
  // time so the output carries no dead branches for unselected reporters.
  const reporterTokens = manifest.reporterTokens?.[sel.reporter] ?? {};
  for (const [k, v] of Object.entries(reporterTokens)) vars[k] = v;

  return vars;
}

/**
 * Render a resolved cell into outDir. Returns the list of files written.
 */
export async function render(
  manifest: Manifest,
  cellPath: string,
  sel: Selection,
  outDir: string,
): Promise<string[]> {
  const vars = buildVars(manifest, sel);
  const filesRoot = join(cellPath, manifest.files);
  const allFiles = await walk(filesRoot);
  const written: string[] = [];

  for (const src of allFiles) {
    const rel = relative(filesRoot, src).replace(/\.tmpl$/, '');
    const dest = join(outDir, rel);
    await mkdir(dirname(dest), { recursive: true });

    const raw = await readFile(src, 'utf8');
    const isTemplate = src.endsWith('.tmpl');
    await writeFile(dest, isTemplate ? substitute(raw, vars) : raw);
    written.push(rel);
  }

  // Render shared partials (e.g. CI workflow) into their mapped destinations.
  for (const partial of manifest.partials) {
    const src = join(PARTIALS_ROOT, partial);
    const dest = join(outDir, partialDest(partial));
    await mkdir(dirname(dest), { recursive: true });
    const raw = await readFile(src, 'utf8');
    await writeFile(dest, partial.endsWith('.tmpl') ? substitute(raw, vars) : raw);
    written.push(partialDest(partial));
  }

  return written;
}
