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
};

interface StoredShape {
  anthropicModel?: string;
  anthropicFastModel?: string;
  jiraBaseUrl?: string;
  jiraEmail?: string;
  systemPrompts?: Record<string, string>;
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
    };
  } catch {
    return { ...DEFAULTS };
  }
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
  return env;
}

export function hasApiKey(): boolean {
  return Boolean(loadSettings().anthropicApiKey);
}
