/** Tunables for the accessibility crawl (spec §6.1, §12: bounded page set). */
export const ACCESSIBILITY_CONFIG = {
  /** Extra same-origin pages to crawl beyond the landing page. */
  maxCrawlLinks: 5,
  /** Navigation timeout per page. */
  navTimeoutMs: 30_000,
  /** Cap on node selectors recorded per violation (keeps evidence bounded). */
  maxNodesPerViolation: 10,
} as const;
