'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  LEVELS,
  cellKey,
  generatePuzzle,
  type Cell,
  type LevelConfig,
  type LevelId,
  type Puzzle,
} from '@/lib/wordSearch';

type Phase = 'menu' | 'playing' | 'over';
type Result = 'win' | 'timeout';

const BEST_KEY = 'qa-prism-fun-best';

/* ------------------------------- sounds -------------------------------- */
// Synthesized with Web Audio — no asset files. Created lazily on first click
// so browser autoplay policies are satisfied.
let audioCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}
function beep(freq: number, start: number, dur: number, type: OscillatorType, gain: number): void {
  const ac = ctx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = ac.currentTime + start;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}
function playCorrect(): void {
  beep(660, 0, 0.12, 'sine', 0.18);
  beep(988, 0.1, 0.16, 'sine', 0.18);
}
function playWrong(): void {
  beep(180, 0, 0.22, 'square', 0.14);
}
function playWin(): void {
  [523, 659, 784, 1047].forEach((f, i) => beep(f, i * 0.12, 0.18, 'triangle', 0.16));
}
function playOver(): void {
  beep(300, 0, 0.3, 'sawtooth', 0.12);
  beep(180, 0.18, 0.4, 'sawtooth', 0.12);
}

/* --------------------------- line-path snapping ------------------------ */
/** Cells from `start` to `end`, snapped to the nearest of 8 straight directions. */
function linePath(start: Cell, end: Cell): Cell[] {
  const dr = end.r - start.r;
  const dc = end.c - start.c;
  if (dr === 0 && dc === 0) return [start];
  const adr = Math.abs(dr);
  const adc = Math.abs(dc);
  let sr = Math.sign(dr);
  let sc = Math.sign(dc);
  let len: number;
  if (adr > adc * 2) {
    sc = 0;
    len = adr;
  } else if (adc > adr * 2) {
    sr = 0;
    len = adc;
  } else {
    len = Math.max(adr, adc);
  }
  const cells: Cell[] = [];
  for (let i = 0; i <= len; i++) cells.push({ r: start.r + sr * i, c: start.c + sc * i });
  return cells;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function WordSearchGame() {
  const [phase, setPhase] = useState<Phase>('menu');
  const [config, setConfig] = useState<LevelConfig | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [found, setFound] = useState<Set<string>>(new Set()); // found words
  const [foundCells, setFoundCells] = useState<Set<string>>(new Set()); // "r,c"
  const [sel, setSel] = useState<Cell[]>([]);
  const [wrong, setWrong] = useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [muted, setMuted] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<Cell | null>(null);
  const draggingRef = useRef(false);
  const scoreRef = useRef(0);

  useEffect(() => {
    const stored = Number(localStorage.getItem(BEST_KEY));
    if (Number.isFinite(stored)) setBest(stored);
  }, []);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const sound = useCallback(
    (fn: () => void) => {
      if (!muted) fn();
    },
    [muted],
  );

  const startLevel = useCallback((level: LevelConfig) => {
    ctx(); // unlock audio within the user gesture
    const p = generatePuzzle(level);
    setConfig(level);
    setPuzzle(p);
    setFound(new Set());
    setFoundCells(new Set());
    setSel([]);
    setWrong(new Set());
    setScore(0);
    setStreak(0);
    setResult(null);
    setTimeLeft(level.seconds);
    setPhase('playing');
  }, []);

  const endGame = useCallback(
    (r: Result) => {
      setResult(r);
      setPhase('over');
      setSel([]);
      startRef.current = null;
      draggingRef.current = false;
      sound(r === 'win' ? playWin : playOver);
      const final = scoreRef.current;
      setBest((b) => {
        const nb = Math.max(b, final);
        localStorage.setItem(BEST_KEY, String(nb));
        return nb;
      });
    },
    [sound],
  );

  // Countdown timer.
  useEffect(() => {
    if (phase !== 'playing') return;
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          endGame('timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, endGame]);

  // Win when every placed word is found.
  useEffect(() => {
    if (phase === 'playing' && puzzle && found.size === puzzle.words.length && puzzle.words.length > 0) {
      endGame('win');
    }
  }, [found, phase, puzzle, endGame]);

  const cellFromPoint = useCallback((clientX: number, clientY: number): Cell | null => {
    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const cellEl = el?.closest('[data-r]') as HTMLElement | null;
    if (!cellEl) return null;
    return { r: Number(cellEl.dataset.r), c: Number(cellEl.dataset.c) };
  }, []);

  const evaluate = useCallback(
    (path: Cell[]) => {
      if (!puzzle || path.length < 2) {
        setSel([]);
        return;
      }
      const letters = path.map((p) => puzzle.grid[p.r]![p.c]!).join('');
      const reversed = [...letters].reverse().join('');
      const match = puzzle.words.find(
        (w) => !found.has(w) && (w === letters || w === reversed),
      );
      if (match) {
        setFound((f) => new Set(f).add(match));
        setFoundCells((fc) => {
          const next = new Set(fc);
          for (const p of path) next.add(cellKey(p.r, p.c));
          return next;
        });
        setScore((s) => s + match.length * 10 + 20);
        setStreak((st) => st + 1);
        sound(playCorrect);
      } else {
        setStreak(0);
        sound(playWrong);
        const flash = new Set(path.map((p) => cellKey(p.r, p.c)));
        setWrong(flash);
        setTimeout(() => setWrong(new Set()), 360);
      }
      setSel([]);
    },
    [puzzle, found, sound],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (phase !== 'playing') return;
      const cell = cellFromPoint(e.clientX, e.clientY);
      if (!cell) return;
      e.preventDefault();
      try {
        gridRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // Non-capturable pointer (e.g. synthetic events) — selection still works.
      }
      draggingRef.current = true;
      startRef.current = cell;
      setSel([cell]);
    },
    [phase, cellFromPoint],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current || !startRef.current) return;
      const cell = cellFromPoint(e.clientX, e.clientY);
      if (!cell) return;
      setSel(linePath(startRef.current, cell));
    },
    [cellFromPoint],
  );

  const onPointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    startRef.current = null;
    setSel((current) => {
      evaluate(current);
      return current;
    });
  }, [evaluate]);

  const selKeys = useMemo(() => new Set(sel.map((p) => cellKey(p.r, p.c))), [sel]);

  const timePct = config ? (timeLeft / config.seconds) * 100 : 0;
  const timeTone =
    timePct > 50 ? 'text-emerald-600' : timePct > 20 ? 'text-amber-600' : 'text-red-600';

  /* --------------------------------- menu -------------------------------- */
  if (phase === 'menu') {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">
            QA Sprint <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">Search</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Find the hidden IT words before the clock runs out. Pick a level.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {(Object.keys(LEVELS) as LevelId[]).map((id) => {
            const lv = LEVELS[id];
            return (
              <button
                key={id}
                onClick={() => startLevel(lv)}
                className="group rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
              >
                <div className="text-lg font-semibold group-hover:text-indigo-700">{lv.label}</div>
                <p className="mt-1 text-xs text-slate-500">{lv.blurb}</p>
                <div className="mt-4 flex flex-wrap gap-1.5 text-[11px] font-medium text-slate-600">
                  <span className="rounded bg-slate-100 px-2 py-0.5">{lv.wordCount} words</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5">{lv.size}×{lv.size}</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5">{fmtTime(lv.seconds)}</span>
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex items-center justify-between text-sm text-slate-500">
          <span>
            Best score: <strong className="text-slate-700">{best}</strong>
          </span>
          <Link href="/dashboard" className="underline underline-offset-2 hover:text-slate-700">
            ← Back to app
          </Link>
        </div>
      </div>
    );
  }

  if (!puzzle || !config) return null;

  /* ------------------------------- playing ------------------------------- */
  return (
    <div className="mx-auto max-w-3xl">
      {/* HUD */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            QA Sprint <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">Search</span>
          </h1>
          <p className="text-xs text-slate-500">{config.label} · find {puzzle.words.length} words</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold tabular-nums ${timeTone}`}>
            ⏱ {fmtTime(timeLeft)}
          </span>
          <span className="flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700">
            ⭐ {score}
          </span>
          <button
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm"
          >
            {muted ? '🔇' : '🔊'}
          </button>
          <button
            onClick={() => startLevel(config)}
            className="rounded-full bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Restart
          </button>
          <button
            onClick={() => setPhase('menu')}
            className="rounded-full border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Exit
          </button>
        </div>
      </div>

      {/* progress + streak */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
          <span>🔥 {streak} streak</span>
          <span>{found.size}/{puzzle.words.length} found · Best {best}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-300"
            style={{ width: `${(found.size / puzzle.words.length) * 100}%` }}
          />
        </div>
      </div>

      {/* find list */}
      <div className="mb-4 flex flex-wrap gap-2">
        {puzzle.words.map((w) => {
          const done = found.has(w);
          return (
            <span
              key={w}
              className={`rounded-full px-3 py-1 text-sm font-medium transition ${
                done
                  ? 'bg-emerald-100 text-emerald-700 line-through'
                  : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              {done ? '✓ ' : ''}
              {w}
            </span>
          );
        })}
      </div>

      {/* grid */}
      <div className="relative rounded-2xl border border-slate-200 bg-white p-3">
        <div
          ref={gridRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="grid touch-none select-none gap-1"
          style={{ gridTemplateColumns: `repeat(${puzzle.size}, minmax(0, 1fr))` }}
        >
          {puzzle.grid.map((row, r) =>
            row.map((ch, c) => {
              const key = cellKey(r, c);
              const isFound = foundCells.has(key);
              const isSel = selKeys.has(key);
              const isWrong = wrong.has(key);
              const cls = isWrong
                ? 'bg-red-500 text-white'
                : isSel
                  ? 'bg-blue-600 text-white'
                  : isFound
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-50 text-slate-800';
              return (
                <div
                  key={key}
                  data-r={r}
                  data-c={c}
                  className={`flex aspect-square items-center justify-center rounded-md text-[clamp(9px,2.4vw,17px)] font-bold transition-colors ${cls}`}
                >
                  {ch}
                </div>
              );
            }),
          )}
        </div>

        {/* game-over overlay */}
        {phase === 'over' && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
              <div className="text-4xl">{result === 'win' ? '🎉' : '⏰'}</div>
              <h2 className="mt-2 text-xl font-semibold">
                {result === 'win' ? 'You found them all!' : "Time's up!"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Score <strong className="text-slate-800">{score}</strong> · {found.size}/
                {puzzle.words.length} words · Best {best}
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <button
                  onClick={() => startLevel(config)}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Play again
                </button>
                <button
                  onClick={() => setPhase('menu')}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Change level
                </button>
                <Link
                  href="/dashboard"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Exit
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-slate-400">
        Drag across letters — horizontally, vertically, or diagonally — to select a word.
      </p>
    </div>
  );
}
