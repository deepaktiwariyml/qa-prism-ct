import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve as resolveCell } from './resolve.js';
import { render } from './render.js';
import { validate } from './validate.js';
import type { RegistryIndex, Selection } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Parse `--key value` and `--flag` style args into an object. */
function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

async function listCells(): Promise<void> {
  const index: RegistryIndex = JSON.parse(
    await readFile(join(__dirname, '..', 'registry', 'index.json'), 'utf8'),
  );
  console.log('\nAvailable stack cells:');
  for (const c of index.cells) {
    console.log(`  • ${c.id.padEnd(18)} ${c.framework} / ${c.language}  [${c.platforms.join(', ')}]`);
  }
  console.log('');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    await listCells();
    return;
  }

  const sel: Selection = {
    platform: (args.platform as string) || 'web-api',
    language: (args.language as string) || 'typescript',
    framework: (args.framework as string) || 'playwright',
    reporter: (args.reporter as string) || 'allure',
    projectName: args.name as string | undefined,
    webBaseUrl: args.webUrl as string | undefined,
    apiBaseUrl: args.apiUrl as string | undefined,
  };

  const outDir = (args.out as string) || join(process.cwd(), 'generated', sel.framework + '-' + sel.language);
  const skipValidate = !!args['skip-validate'];

  console.log(`\nResolving: ${sel.framework} / ${sel.language} / ${sel.platform} / reporter=${sel.reporter}`);
  const res = await resolveCell(sel);

  if (!res.matched || !res.manifest || !res.cellPath) {
    console.error(`\n✖ ${res.reason}`);
    process.exit(1);
  }

  console.log(`✓ Matched cell "${res.manifest.id}". Rendering to ${outDir}`);
  const written = await render(res.manifest, res.cellPath, sel, outDir);
  console.log(`✓ Wrote ${written.length} files.`);

  console.log(skipValidate ? '↷ Skipping validation.' : '… Validating (install + compile)…');
  const v = await validate(res.manifest, outDir, skipValidate);
  if (!v.passed) {
    console.error('\n✖ Validation failed:');
    for (const r of v.results.filter((x) => !x.ok)) console.error(`  ${r.cmd}\n${r.output}`);
    process.exit(1);
  }

  console.log(`\n✓ Done. Framework generated at:\n  ${outDir}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
