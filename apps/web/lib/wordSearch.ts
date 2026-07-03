// Pure word-search generation for the FUN section. No React, no DOM — testable.

export type LevelId = 'beginner' | 'medium' | 'hard';

export interface Direction {
  dr: number;
  dc: number;
}

export interface LevelConfig {
  id: LevelId;
  label: string;
  blurb: string;
  size: number;
  wordCount: number;
  seconds: number;
  directions: Direction[];
  pool: string[];
}

export interface Cell {
  r: number;
  c: number;
}

export interface Placement {
  word: string;
  cells: Cell[];
}

export interface Puzzle {
  size: number;
  grid: string[][];
  words: string[];
  placements: Placement[];
}

// Direction sets, layered by difficulty.
const RIGHT: Direction = { dr: 0, dc: 1 };
const DOWN: Direction = { dr: 1, dc: 0 };
const DIAG_DR: Direction = { dr: 1, dc: 1 }; // down-right
const DIAG_UR: Direction = { dr: -1, dc: 1 }; // up-right
const LEFT: Direction = { dr: 0, dc: -1 };
const UP: Direction = { dr: -1, dc: 0 };
const DIAG_DL: Direction = { dr: 1, dc: -1 };
const DIAG_UL: Direction = { dr: -1, dc: -1 };

const IT_WORDS = {
  // 3–5 letters — approachable.
  beginner: [
    'API', 'BUG', 'GIT', 'CSS', 'SQL', 'RAM', 'CPU', 'APP', 'WEB', 'DATA',
    'JAVA', 'NODE', 'HTML', 'USER', 'CODE', 'TEST', 'LINK', 'BYTE', 'LOOP', 'CLOUD',
  ],
  // 5–8 letters — software/hardware/agile vocabulary.
  medium: [
    'SERVER', 'DOCKER', 'PYTHON', 'LAMBDA', 'DEVOPS', 'KANBAN', 'GITHUB', 'BACKEND',
    'FRONTEND', 'DATABASE', 'NETWORK', 'COMPILER', 'FIREWALL', 'HARDWARE', 'SOFTWARE',
    'STARTUP', 'PRODUCT', 'BROWSER', 'MACHINE', 'STORAGE',
  ],
  // 8–12 letters — AI, architecture, entrepreneurship.
  hard: [
    'KUBERNETES', 'MICROSERVICE', 'BLOCKCHAIN', 'ALGORITHM', 'ARTIFICIAL', 'INTELLIGENCE',
    'ENTREPRENEUR', 'INNOVATION', 'AUTOMATION', 'DEPLOYMENT', 'MIDDLEWARE', 'FRAMEWORKS',
    'ENCRYPTION', 'SCALABILITY', 'REPOSITORY', 'ARCHITECT',
  ],
};

export const LEVELS: Record<LevelId, LevelConfig> = {
  beginner: {
    id: 'beginner',
    label: 'Beginner',
    blurb: 'Short IT terms · straight lines',
    size: 9,
    wordCount: 4,
    seconds: 120,
    directions: [RIGHT, DOWN],
    pool: IT_WORDS.beginner,
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    blurb: 'Software & hardware · adds diagonals',
    size: 11,
    wordCount: 6,
    seconds: 100,
    directions: [RIGHT, DOWN, DIAG_DR, DIAG_UR],
    pool: IT_WORDS.medium,
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    blurb: 'AI & architecture · any direction, reversed',
    size: 13,
    wordCount: 8,
    seconds: 80,
    directions: [RIGHT, DOWN, DIAG_DR, DIAG_UR, LEFT, UP, DIAG_DL, DIAG_UL],
    pool: IT_WORDS.hard,
  },
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** Pick `count` distinct words from the pool that fit the grid. */
function pickWords(pool: string[], count: number, size: number): string[] {
  const eligible = shuffle(pool.filter((w) => w.length <= size));
  return eligible.slice(0, count);
}

function inBounds(size: number, r: number, c: number): boolean {
  return r >= 0 && r < size && c >= 0 && c < size;
}

/**
 * Generate a puzzle: place as many of the chosen words as possible in the
 * allowed directions, then fill the rest with random letters. Only the words
 * actually placed are returned as targets, so the "find" list is always exact.
 */
export function generatePuzzle(config: LevelConfig): Puzzle {
  const { size, directions } = config;
  const grid: string[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ''),
  );
  const placements: Placement[] = [];
  // Longest first — easier to fit before the grid fills up.
  const words = pickWords(config.pool, config.wordCount, size).sort(
    (a, b) => b.length - a.length,
  );

  for (const word of words) {
    let placed = false;
    for (let attempt = 0; attempt < 250 && !placed; attempt++) {
      const dir = directions[randInt(directions.length)] as Direction;
      const r0 = randInt(size);
      const c0 = randInt(size);
      const endR = r0 + dir.dr * (word.length - 1);
      const endC = c0 + dir.dc * (word.length - 1);
      if (!inBounds(size, endR, endC)) continue;

      const cells: Cell[] = [];
      let ok = true;
      for (let i = 0; i < word.length; i++) {
        const r = r0 + dir.dr * i;
        const c = c0 + dir.dc * i;
        const existing = grid[r]![c]!;
        if (existing !== '' && existing !== word[i]) {
          ok = false;
          break;
        }
        cells.push({ r, c });
      }
      if (!ok) continue;

      for (let i = 0; i < word.length; i++) {
        grid[cells[i]!.r]![cells[i]!.c] = word[i] as string;
      }
      placements.push({ word, cells });
      placed = true;
    }
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r]![c] === '') grid[r]![c] = ALPHABET[randInt(26)] as string;
    }
  }

  return { size, grid, words: placements.map((p) => p.word), placements };
}

export function cellKey(r: number, c: number): string {
  return `${r},${c}`;
}
