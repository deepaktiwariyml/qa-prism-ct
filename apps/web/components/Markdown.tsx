import { Fragment, type ReactNode } from 'react';

/**
 * Minimal, dependency-free markdown renderer for LLM prose. Supports:
 * `#`–`####` headings, `-`/`*` bullet lists, `**bold**`, `*italic*`, and
 * `` `code` ``. Paragraphs are split on blank lines; single newlines within a
 * paragraph are preserved as line breaks. No raw HTML is ever rendered.
 */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={`${keyBase}-b${i}`}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(
        <code key={`${keyBase}-c${i}`} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.85em]">
          {m[3]}
        </code>,
      );
    } else if (m[4] !== undefined) {
      nodes.push(<em key={`${keyBase}-i${i}`}>{m[4]}</em>);
    }
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (!para.length) return;
    const lines2 = [...para];
    const k = key++;
    blocks.push(
      <p key={k} className="mb-3 text-sm leading-relaxed text-slate-700">
        {lines2.map((ln, idx) => (
          <Fragment key={idx}>
            {idx > 0 && <br />}
            {renderInline(ln, `p${k}-${idx}`)}
          </Fragment>
        ))}
      </p>,
    );
    para = [];
  };
  const flushList = () => {
    if (!list.length) return;
    const items = [...list];
    const k = key++;
    blocks.push(
      <ul key={k} className="mb-3 ml-5 list-disc space-y-1 text-sm leading-relaxed text-slate-700">
        {items.map((it, idx) => (
          <li key={idx}>{renderInline(it, `l${k}-${idx}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (heading) {
      flushPara();
      flushList();
      const k = key++;
      const big = heading[1]!.length <= 2;
      blocks.push(
        <p key={k} className={`mb-1.5 mt-3 font-semibold text-slate-900 ${big ? 'text-base' : 'text-sm'}`}>
          {renderInline(heading[2]!, `h${k}`)}
        </p>,
      );
    } else if (bullet) {
      flushPara();
      list.push(bullet[1]!);
    } else if (line.trim() === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();

  return <div className={className}>{blocks}</div>;
}
