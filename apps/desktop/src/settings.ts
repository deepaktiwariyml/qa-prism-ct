import { app, safeStorage } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * User settings for the desktop app. Secrets (the Anthropic key and GitHub
 * token) are encrypted at rest with the OS keychain via Electron safeStorage;
 * only ciphertext is written to disk. Non-secret preferences are stored in the
 * clear. Everything lives under the app's per-user userData directory.
 */
export interface Settings {
  anthropicApiKey: string;
  anthropicModel: string;
  anthropicFastModel: string;
  githubToken: string;
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiToken: string;
  // Per-operation system-prompt overrides, keyed by SYSTEM_PROMPTS[].key.
  // Not secret — stored in the clear. Blank/absent = use the canonical default.
  systemPrompts: Record<string, string>;
  // Feature flag: gate the (experimental) "What's Broken" feature. Off by default.
  whatsBrokenEnabled: boolean;
  // Extra test-case column names the user added; appear in the generator's
  // "Add column" menu. Not secret — stored in the clear.
  customTestcaseColumns: string[];
}

const DEFAULTS: Settings = {
  anthropicApiKey: '',
  anthropicModel: 'claude-sonnet-4-6',
  anthropicFastModel: 'claude-haiku-4-5',
  githubToken: '',
  jiraBaseUrl: '',
  jiraEmail: '',
  jiraApiToken: '',
  systemPrompts: {},
  whatsBrokenEnabled: false,
  customTestcaseColumns: [],
};

interface StoredShape {
  anthropicModel?: string;
  anthropicFastModel?: string;
  jiraBaseUrl?: string;
  jiraEmail?: string;
  systemPrompts?: Record<string, string>;
  whatsBrokenEnabled?: boolean;
  customTestcaseColumns?: string[];
  // secrets stored as base64 ciphertext (safeStorage) or '' when unset
  anthropicApiKeyEnc?: string;
  githubTokenEnc?: string;
  jiraApiTokenEnc?: string;
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

function encrypt(value: string): string {
  if (!value) return '';
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(value).toString('base64');
    }
  } catch {
    /* fall through */
  }
  // Fallback (encryption unavailable): store obfuscated, clearly marked.
  return `plain:${Buffer.from(value, 'utf8').toString('base64')}`;
}

function decrypt(enc: string | undefined): string {
  if (!enc) return '';
  try {
    if (enc.startsWith('plain:')) return Buffer.from(enc.slice(6), 'base64').toString('utf8');
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch {
    return '';
  }
}

export function loadSettings(): Settings {
  try {
    const p = settingsPath();
    if (!existsSync(p)) return { ...DEFAULTS };
    const raw = JSON.parse(readFileSync(p, 'utf8')) as StoredShape;
    return {
      anthropicApiKey: decrypt(raw.anthropicApiKeyEnc),
      anthropicModel: raw.anthropicModel || DEFAULTS.anthropicModel,
      anthropicFastModel: raw.anthropicFastModel || DEFAULTS.anthropicFastModel,
      githubToken: decrypt(raw.githubTokenEnc),
      jiraBaseUrl: raw.jiraBaseUrl || '',
      jiraEmail: raw.jiraEmail || '',
      jiraApiToken: decrypt(raw.jiraApiTokenEnc),
      systemPrompts:
        raw.systemPrompts && typeof raw.systemPrompts === 'object' ? { ...raw.systemPrompts } : {},
      whatsBrokenEnabled: raw.whatsBrokenEnabled === true,
      customTestcaseColumns: Array.isArray(raw.customTestcaseColumns)
        ? raw.customTestcaseColumns.filter((c): c is string => typeof c === 'string')
        : [],
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Trim, drop blanks, de-dupe (case-insensitive), and cap custom columns. */
function cleanColumns(cols: string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of cols ?? []) {
    const name = String(raw).trim().slice(0, 60);
    const key = name.toLowerCase();
    if (name && !seen.has(key)) {
      seen.add(key);
      out.push(name);
    }
    if (out.length >= 30) break;
  }
  return out;
}

export function saveSettings(next: Settings): void {
  // Keep only non-empty overrides so a cleared field reverts to the default.
  const prompts: Record<string, string> = {};
  for (const [k, v] of Object.entries(next.systemPrompts ?? {})) {
    if (typeof v === 'string' && v.trim()) prompts[k] = v;
  }
  const stored: StoredShape = {
    anthropicModel: next.anthropicModel || DEFAULTS.anthropicModel,
    anthropicFastModel: next.anthropicFastModel || DEFAULTS.anthropicFastModel,
    jiraBaseUrl: next.jiraBaseUrl || '',
    jiraEmail: next.jiraEmail || '',
    systemPrompts: prompts,
    whatsBrokenEnabled: Boolean(next.whatsBrokenEnabled),
    customTestcaseColumns: cleanColumns(next.customTestcaseColumns),
    anthropicApiKeyEnc: encrypt(next.anthropicApiKey),
    githubTokenEnc: encrypt(next.githubToken),
    jiraApiTokenEnc: encrypt(next.jiraApiToken),
  };
  const dir = app.getPath('userData');
  mkdirSync(dir, { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(stored, null, 2), 'utf8');
}

/** Env vars the embedded API + web servers read, derived from settings. */
export function settingsToEnv(s: Settings): Record<string, string> {
  const env: Record<string, string> = {
    ANTHROPIC_MODEL: s.anthropicModel || DEFAULTS.anthropicModel,
    ANTHROPIC_FAST_MODEL: s.anthropicFastModel || DEFAULTS.anthropicFastModel,
  };
  if (s.anthropicApiKey) env.ANTHROPIC_API_KEY = s.anthropicApiKey;
  if (s.githubToken) env.GITHUB_TOKEN = s.githubToken;
  if (s.jiraBaseUrl) env.JIRA_BASE_URL = s.jiraBaseUrl;
  if (s.jiraEmail) env.JIRA_EMAIL = s.jiraEmail;
  if (s.jiraApiToken) env.JIRA_API_TOKEN = s.jiraApiToken;
  // Always set explicitly ('1'/'0') so toggling off overwrites a prior '1'.
  env.WHATS_BROKEN_ENABLED = s.whatsBrokenEnabled ? '1' : '0';
  // Always set (JSON, possibly '[]') so clearing overwrites a prior value.
  env.QA_CUSTOM_TESTCASE_COLUMNS = JSON.stringify(cleanColumns(s.customTestcaseColumns));
  return env;
}

export function hasApiKey(): boolean {
  return Boolean(loadSettings().anthropicApiKey);
}
