import {
  PILLARS,
  bumpSeverity,
  highestSeverity,
  type Correlation,
  type Finding,
  type Pillar,
} from '@qa-prism/core';
import { resolveConfig, type ScoringOptions } from './config.js';

/** A linking token derived from a finding — a shared tag, component, or selector. */
function linkKeys(f: Finding): string[] {
  const keys: string[] = [];
  for (const tag of f.tags) {
    const t = tag.trim().toLowerCase();
    if (t) keys.push(`tag:${t}`);
  }
  if (f.location.component) keys.push(`component:${f.location.component.trim().toLowerCase()}`);
  if (f.location.selector) keys.push(`selector:${f.location.selector.trim().toLowerCase()}`);
  return keys;
}

/** Human-readable label for a link key, used in the rationale. */
function describeKey(key: string): string {
  const [kind, ...rest] = key.split(':');
  const value = rest.join(':');
  if (kind === 'tag') return `tag "${value}"`;
  if (kind === 'component') return `component "${value}"`;
  return `selector "${value}"`;
}

/**
 * Find cross-pillar correlations among findings (spec §6.6). Findings are linked
 * when they share any tag, component, or selector; connected components of that
 * relation form groups. A group that spans ≥2 pillars becomes one Correlation.
 *
 * Fully deterministic: findings are processed in id order and correlation ids
 * are derived from the sorted member ids (no uuids, no randomness).
 */
export function findCorrelations(findings: Finding[], options: ScoringOptions = {}): Correlation[] {
  const { bumpAtGroupSize } = resolveConfig(options);
  const sorted = [...findings].sort((a, b) => a.id.localeCompare(b.id));

  // Union-find over finding indices, joined when they share a link key.
  const parent = sorted.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    while (parent[i] !== root) {
      const next = parent[i]!;
      parent[i] = root;
      i = next;
    }
    return root;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  // First finding index seen for each link key → union subsequent holders to it.
  const keyToIndex = new Map<string, number>();
  sorted.forEach((f, i) => {
    for (const key of linkKeys(f)) {
      const seen = keyToIndex.get(key);
      if (seen === undefined) keyToIndex.set(key, i);
      else union(seen, i);
    }
  });

  // Collect connected components (preserving id order via sorted[]).
  const groups = new Map<number, number[]>();
  sorted.forEach((_, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(i);
    else groups.set(root, [i]);
  });

  const correlations: Correlation[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const groupFindings = members.map((i) => sorted[i]!);
    const pillars = PILLARS.filter((p) => groupFindings.some((f) => f.pillar === p));
    if (pillars.length < 2) continue; // must span ≥2 pillars

    const findingIds = groupFindings.map((f) => f.id); // already id-sorted
    const base = highestSeverity(groupFindings.map((f) => f.severity));
    const bumped = groupFindings.length >= bumpAtGroupSize;
    const severity = bumped ? bumpSeverity(base) : base;

    // Which keys actually appear in ≥2 members — the reason they're linked.
    const keyCounts = new Map<string, number>();
    for (const f of groupFindings) {
      for (const key of new Set(linkKeys(f))) {
        keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
      }
    }
    const sharedKeys = [...keyCounts.entries()]
      .filter(([, n]) => n >= 2)
      .map(([k]) => k)
      .sort();

    correlations.push({
      id: `corr:${findingIds.join('+')}`,
      findingIds,
      pillars,
      rationale: buildRationale(groupFindings.length, pillars, sharedKeys, bumped),
      severity,
    });
  }

  // Stable output order.
  return correlations.sort((a, b) => a.id.localeCompare(b.id));
}

function buildRationale(
  count: number,
  pillars: Pillar[],
  sharedKeys: string[],
  bumped: boolean,
): string {
  const pillarList = pillars.join(', ');
  const basis =
    sharedKeys.length > 0 ? sharedKeys.map(describeKey).join(', ') : 'a shared area';
  const bumpNote = bumped
    ? ` With ${count} linked findings, the combined severity is raised one level.`
    : '';
  return `${count} findings across ${pillarList} are linked by ${basis}. An issue in this area spans ${pillars.length} quality pillars, which single-purpose tools miss.${bumpNote}`;
}
