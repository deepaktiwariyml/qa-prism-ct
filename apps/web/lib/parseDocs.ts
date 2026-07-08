// Browser-side document parsing for "What's Broken". Everything runs in the
// client and heavy parsers are dynamically imported so they never touch SSR or
// the Electron main bundle. We extract plain text (always) plus structured rows
// (for spreadsheet / CSV / JSON test-case exports) and send only that to the API.

export interface ParsedDoc {
  name: string;
  kind: string; // e.g. 'xlsx', 'pdf', 'docx', 'csv', 'json', 'markdown', 'text'
  text: string;
  structured?: Record<string, unknown>[];
  error?: string;
}

const MAX_TEXT = 400_000;
const MAX_ROWS = 2_000;

function ext(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1]! : '';
}

const clip = (s: string) => (s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}\n… (truncated)` : s);

async function parseSpreadsheet(file: File, kind: string): Promise<ParsedDoc> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const rows: Record<string, unknown>[] = [];
  const textParts: string[] = [];
  for (const sheet of wb.SheetNames) {
    const ws = wb.Sheets[sheet];
    if (!ws) continue;
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    rows.push(...json);
    textParts.push(`# ${sheet}\n${XLSX.utils.sheet_to_csv(ws)}`);
  }
  const structured = rows.slice(0, MAX_ROWS);
  return { name: file.name, kind, text: clip(textParts.join('\n\n')), structured: structured.length ? structured : undefined };
}

async function parseCsv(file: File): Promise<ParsedDoc> {
  const XLSX = await import('xlsx');
  const text = await file.text();
  const wb = XLSX.read(text, { type: 'string' });
  const ws = wb.Sheets[wb.SheetNames[0]!];
  const structured = ws ? XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' }).slice(0, MAX_ROWS) : [];
  return { name: file.name, kind: 'csv', text: clip(text), structured: structured.length ? structured : undefined };
}

function parseJson(name: string, raw: string): ParsedDoc {
  let structured: Record<string, unknown>[] | undefined;
  try {
    const data = JSON.parse(raw);
    if (Array.isArray(data)) structured = data.filter((x) => x && typeof x === 'object').slice(0, MAX_ROWS);
    else if (Array.isArray((data as { testcases?: unknown[] }).testcases))
      structured = (data as { testcases: Record<string, unknown>[] }).testcases.slice(0, MAX_ROWS);
  } catch {
    /* fall back to text */
  }
  return { name, kind: 'json', text: clip(raw), structured };
}

async function parsePdf(file: File): Promise<ParsedDoc> {
  const pdfjs = await import('pdfjs-dist');
  // The worker is served as a static asset from /public (copied there at build
  // time by scripts/copy-pdf-worker.mjs) rather than bundled — webpack can't
  // parse the ESM worker via `new URL(...)`. Same-origin, so it works offline
  // in the desktop build too.
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    parts.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
    if (parts.join('\n').length > MAX_TEXT) break;
  }
  return { name: file.name, kind: 'pdf', text: clip(parts.join('\n\n')) };
}

async function parseDocx(file: File): Promise<ParsedDoc> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return { name: file.name, kind: 'docx', text: clip(value) };
}

/** Parse one uploaded file into text (+ structured rows when applicable). */
export async function parseFile(file: File): Promise<ParsedDoc> {
  const e = ext(file.name);
  try {
    if (e === 'xlsx' || e === 'xls' || e === 'xlsm') return await parseSpreadsheet(file, e === 'xls' ? 'xls' : 'xlsx');
    if (e === 'csv' || e === 'tsv') return await parseCsv(file);
    if (e === 'json') return parseJson(file.name, await file.text());
    if (e === 'pdf') return await parsePdf(file);
    if (e === 'docx') return await parseDocx(file);
    if (e === 'doc')
      return { name: file.name, kind: 'doc', text: '', error: 'Legacy .doc is not supported — save as .docx or PDF.' };
    // md, markdown, txt, text, log, and anything else → treat as UTF-8 text.
    const kind = e === 'md' || e === 'markdown' ? 'markdown' : e || 'text';
    return { name: file.name, kind, text: clip(await file.text()) };
  } catch (err) {
    return { name: file.name, kind: e || 'file', text: '', error: err instanceof Error ? err.message : String(err) };
  }
}

export const ACCEPTED_EXTENSIONS =
  '.xlsx,.xls,.xlsm,.csv,.tsv,.json,.pdf,.docx,.md,.markdown,.txt,.text,.log';
