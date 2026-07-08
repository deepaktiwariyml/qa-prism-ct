// Central registry of the system prompts behind every LLM call in QA Prism.
//
// Two ideas live here:
//   1. The CANONICAL defaults — the prompts we believe are correct. The
//      "System Prompts" reference page always shows these, unchanged.
//   2. Runtime OVERRIDES — a user can edit a prompt in Settings; the override
//      is applied to all subsequent LLM calls via resolveSystemPrompt(), but
//      the canonical default (and the reference page) never changes.
//
// Every call site resolves its prompt through resolveSystemPrompt(key) so a
// single override map drives the whole app.

import { DEFAULT_TESTCASE_SYSTEM } from './testcase-system.js';
import { IMPACT_ANALYSIS_SYSTEM } from './impact-analysis.js';
import {
  BREAKAGE_EXTRACT_CHANGE_SYSTEM,
  BREAKAGE_EXTRACT_REQUIREMENTS_SYSTEM,
  BREAKAGE_EXTRACT_TESTCASES_SYSTEM,
  BREAKAGE_ANALYZE_SYSTEM,
} from './breakage.js';

// --- Inline prompt defaults (previously scattered across the API servers) ---

export const FILL_COLUMNS_SYSTEM =
  'You are a senior QA engineer filling in a test-case table. For each test case (a fixed one-line title you must NOT change or restate) and each requested column, produce a concise, useful cell value inferred from the column name (e.g. "Priority" -> High/Medium/Low; "Preconditions", "Test Steps", "Expected Result", "Test Data" -> a short phrase or sentence). Return JSON with a `rows` matrix where rows[i] is the array of cell values for test case i, one value per column in the exact given order.';

export const COMBINE_SYSTEM =
  'You are a senior QA engineer. Merge the given manual test cases into ONE coherent, concise one-line test case that preserves their combined intent and important checks. Imperative, no numbering. Classify it as positive, negative, or edge.';

export const EXPLAIN_TESTCASE_SYSTEM =
  'You are a senior QA engineer. Explain a one-line manual test case clearly and practically for a tester. Format the answer as Markdown with these bold section labels, EACH ON ITS OWN LINE and separated by a blank line, never one run-on paragraph:\n\n**What it verifies**\n<1-2 sentences>\n\n**Preconditions**\n- <bullet>\n- <bullet>\n\n**Steps**\n1. <step>\n2. <step>\n\n**Expected Result**\n- <bullet or short sentence>\n\nKeep it concise. Respond with the Markdown directly — do NOT wrap it in code fences or JSON.';

export const EXPLAIN_FEATURE_SYSTEM =
  'You explain software features in plain, simple language that ANY audience can follow — a beginner, a manager, a lead, and a director alike. Avoid jargon; when a technical term is unavoidable, define it briefly. Use everyday analogies and at least one concrete example. Format the answer as GitHub-flavored Markdown with these bold section labels, each on its own line and separated by a blank line: **In simple terms** (1-2 sentences), **How it works** (a few plain steps as a numbered list), **Example** (a concrete walkthrough), and **Why it matters** (business value, as bullet points). Keep it concise and friendly. Respond with the Markdown directly — do NOT wrap it in code fences or JSON.';

// --- Registry ---

export interface SystemPromptDef {
  /** Stable id, matches the LLM `operation` where practical. */
  key: string;
  /** Human label for the reference page and Settings. */
  label: string;
  /** One-line description of what this LLM call does. */
  description: string;
  /** The canonical prompt we believe is correct. Never mutated. */
  default: string;
}

export const SYSTEM_PROMPTS: readonly SystemPromptDef[] = [
  {
    key: 'testcases.generate',
    label: 'Generate Test Cases',
    description: 'Turns a feature description into a comprehensive set of manual test cases.',
    default: DEFAULT_TESTCASE_SYSTEM,
  },
  {
    key: 'testcases.fill-columns',
    label: 'Fill Test-Case Columns',
    description: 'Fills user-defined columns (Priority, Steps, Expected Result…) for existing test cases.',
    default: FILL_COLUMNS_SYSTEM,
  },
  {
    key: 'testcases.combine',
    label: 'Combine Test Cases',
    description: 'Merges several selected test cases into one coherent case.',
    default: COMBINE_SYSTEM,
  },
  {
    key: 'testcases.explain',
    label: 'Explain Test Case',
    description: 'Explains a single test case (what it verifies, preconditions, steps, expected result).',
    default: EXPLAIN_TESTCASE_SYSTEM,
  },
  {
    key: 'testcases.explain-feature',
    label: 'Explain Feature',
    description: 'Explains the feature being tested in plain language for any audience.',
    default: EXPLAIN_FEATURE_SYSTEM,
  },
  {
    key: 'impact.analyze',
    label: 'Impact Analysis',
    description: 'Turns a GitHub pull-request diff into a what-changed / what-is-impacted / testing-checklist report.',
    default: IMPACT_ANALYSIS_SYSTEM,
  },
  {
    key: 'breakage.extract-change',
    label: 'Breakage: Extract Change',
    description: 'Extracts structured change facts (APIs, DB, validations, flags, downstream hints) from a PR diff.',
    default: BREAKAGE_EXTRACT_CHANGE_SYSTEM,
  },
  {
    key: 'breakage.extract-requirements',
    label: 'Breakage: Extract Requirements',
    description: 'Extracts requirements, flows, and acceptance criteria from a requirement or design document.',
    default: BREAKAGE_EXTRACT_REQUIREMENTS_SYSTEM,
  },
  {
    key: 'breakage.extract-testcases',
    label: 'Breakage: Extract Test Cases',
    description: 'Normalizes existing test cases from an uploaded document into a structured list.',
    default: BREAKAGE_EXTRACT_TESTCASES_SYSTEM,
  },
  {
    key: 'breakage.analyze',
    label: "Breakage: What's Broken Analysis",
    description: 'Predicts broken areas, impacted tests, missing coverage, risk, and a regression suite from all inputs.',
    default: BREAKAGE_ANALYZE_SYSTEM,
  },
] as const;

const DEFAULT_BY_KEY: ReadonlyMap<string, string> = new Map(SYSTEM_PROMPTS.map((p) => [p.key, p.default]));

// --- Overrides (runtime) ---

let overrides: Record<string, string> = {};

/**
 * Replace the current set of prompt overrides. Only non-empty values that
 * differ from the default matter; blank/whitespace values are ignored so a
 * cleared field falls back to the canonical default.
 */
export function setSystemPromptOverrides(next: Record<string, string> | undefined | null): void {
  const clean: Record<string, string> = {};
  if (next) {
    for (const [key, value] of Object.entries(next)) {
      if (typeof value === 'string' && value.trim() && DEFAULT_BY_KEY.has(key)) clean[key] = value;
    }
  }
  overrides = clean;
}

/** Current overrides (as applied). Useful for pre-filling Settings. */
export function getSystemPromptOverrides(): Record<string, string> {
  return { ...overrides };
}

/**
 * Effective system prompt for an operation: the user override if set,
 * otherwise the canonical default. Returns '' for an unknown key.
 */
export function resolveSystemPrompt(key: string): string {
  const override = overrides[key];
  if (typeof override === 'string' && override.trim()) return override;
  return DEFAULT_BY_KEY.get(key) ?? '';
}
