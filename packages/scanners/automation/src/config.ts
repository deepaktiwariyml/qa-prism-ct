/** Tunables for automation-health analysis (spec §6.4). */
export const AUTOMATION_CONFIG = {
  /** Directories never worth walking. */
  ignoreDirs: new Set(['node_modules', '.git', 'dist', '.next', 'build', 'coverage', '.turbo']),
  /** Safety cap on how many files we walk. */
  maxFiles: 5000,
  /** A test slower than this (seconds) is flagged. */
  slowTestSeconds: 30,
  /** Cap on example occurrences recorded per finding. */
  maxExamples: 10,
} as const;

export const TEST_FILE_RE = /\.(spec|test|cy)\.(ts|tsx|js|jsx|mjs|cjs|py|java)$/;
export const JS_TS_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
