import { z } from 'zod';

/** The four quality disciplines QA Prism scans. */
export const PILLARS = ['automation', 'accessibility', 'security', 'performance'] as const;

export const PillarSchema = z.enum(PILLARS);
export type Pillar = z.infer<typeof PillarSchema>;

/**
 * Short, stable prefix used at the front of every `Finding.code` for a pillar.
 * These are load-bearing: codes like `a11y.image-alt` / `sec.missing-hsts` are
 * used for trend tracking and dedupe, so the prefixes must never change.
 */
export const PILLAR_CODE_PREFIX: Record<Pillar, string> = {
  automation: 'automation',
  accessibility: 'a11y',
  security: 'sec',
  performance: 'perf',
};

/** Normalize an arbitrary slug into the kebab-case tail of a finding code. */
function slugify(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build a stable, pillar-namespaced finding code, e.g.
 * `makeFindingCode('accessibility', 'Image alt')` -> `a11y.image-alt`.
 *
 * @throws if `slug` is empty or contains no alphanumeric characters.
 */
export function makeFindingCode(pillar: Pillar, slug: string): string {
  const tail = slugify(slug);
  if (tail.length === 0) {
    throw new Error(`makeFindingCode: slug "${slug}" produced an empty code tail`);
  }
  return `${PILLAR_CODE_PREFIX[pillar]}.${tail}`;
}
