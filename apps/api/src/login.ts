import { chromium, type Locator, type Page } from 'playwright';
import { z } from 'zod';
import { createLlmClient } from '@qa-prism/llm';

/** Optional per-target selector overrides for stubborn login forms. */
export interface LoginRecipe {
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
}

export interface LoginOptions {
  loginUrl: string;
  username: string;
  password: string;
  recipe?: LoginRecipe;
}

export interface LoginResult {
  /** Playwright storage state (cookies + localStorage) for the logged-in session. */
  storageState: unknown;
  finalUrl: string;
}

/** Thrown with a QA-readable message when login can't be completed. */
export class LoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoginError';
  }
}

const NAV_TIMEOUT_MS = 30_000;

/**
 * Refuse cloud metadata / link-local targets — a server-side login must never
 * be pointed at 169.254.0.0/16 (e.g. 169.254.169.254), which can leak instance
 * credentials. Normal private ranges (10/172.16/192.168) are allowed so
 * internal apps still work.
 */
function assertSafeTarget(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new LoginError(`Invalid login URL: ${rawUrl}`);
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new LoginError('Login URL must be http(s).');
  }
  const host = url.hostname.toLowerCase();
  const blockedHosts = new Set(['metadata.google.internal', 'metadata']);
  if (blockedHosts.has(host) || host.startsWith('169.254.')) {
    throw new LoginError('Login URL points at a blocked metadata/link-local address.');
  }
  return url;
}

async function firstVisible(page: Page, selectors: string[]): Promise<Locator | null> {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    try {
      if ((await loc.count()) > 0 && (await loc.isVisible())) return loc;
    } catch {
      // bad selector or detached node — try the next one
    }
  }
  return null;
}

const PASSWORD_SELECTORS = ['input[type="password"]'];
const USERNAME_SELECTORS = [
  'input[autocomplete="username"]',
  'input[autocomplete="email"]',
  'input[type="email"]',
  'input[name*="user" i]',
  'input[name*="email" i]',
  'input[name*="login" i]',
  'input[id*="user" i]',
  'input[id*="email" i]',
  'input[type="text"]:not([type="hidden"])',
];
const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Log in")',
  'button:has-text("Sign in")',
  'button:has-text("Login")',
  'button:has-text("Continue")',
  'button:has-text("Next")',
];

async function findPassword(page: Page, recipe?: LoginRecipe): Promise<Locator | null> {
  return firstVisible(page, recipe?.passwordSelector ? [recipe.passwordSelector] : PASSWORD_SELECTORS);
}
async function findUsername(page: Page, recipe?: LoginRecipe): Promise<Locator | null> {
  return firstVisible(page, recipe?.usernameSelector ? [recipe.usernameSelector] : USERNAME_SELECTORS);
}
async function findSubmit(page: Page, recipe?: LoginRecipe): Promise<Locator | null> {
  return firstVisible(page, recipe?.submitSelector ? [recipe.submitSelector] : SUBMIT_SELECTORS);
}

/** Last resort: ask Claude which selectors are the login fields. */
async function llmDetect(page: Page): Promise<LoginRecipe | null> {
  let fields: unknown[];
  try {
    fields = await page.$$eval('input, button, a[role="button"]', (els) =>
      els.slice(0, 60).map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type'),
        name: el.getAttribute('name'),
        id: el.getAttribute('id'),
        placeholder: el.getAttribute('placeholder'),
        ariaLabel: el.getAttribute('aria-label'),
        autocomplete: el.getAttribute('autocomplete'),
        text: (el.textContent ?? '').trim().slice(0, 40),
      })),
    );
  } catch {
    return null;
  }
  const schema = z.object({
    usernameSelector: z.string().nullable(),
    passwordSelector: z.string().nullable(),
    submitSelector: z.string().nullable(),
  });
  try {
    const llm = createLlmClient();
    const result = await llm.completeJSON({
      system:
        'You identify the login form fields on a web page. Given a list of input/button elements, return robust CSS selectors for the username field, the password field, and the submit button. Prefer selectors on id or name. Use null if a field is not present on this step.',
      prompt: `Elements on the page:\n${JSON.stringify(fields, null, 2)}`,
      schema,
    });
    return {
      usernameSelector: result.usernameSelector ?? undefined,
      passwordSelector: result.passwordSelector ?? undefined,
      submitSelector: result.submitSelector ?? undefined,
    };
  } catch {
    // No API key, or the model failed — heuristics already tried, so give up.
    return null;
  }
}

async function submit(page: Page, submitBtn: Locator | null, passwordField: Locator): Promise<void> {
  if (submitBtn) {
    await submitBtn.click({ timeout: 5_000 }).catch(() => {});
  } else {
    // No obvious button — Enter submits nearly every login form.
    await passwordField.press('Enter').catch(() => {});
  }
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT_MS }).catch(() => {});
}

/**
 * Log into a target headlessly and return the authenticated storage state.
 * Detection is heuristic-first (password-anchored), with a per-target recipe
 * override and an LLM fallback. Handles single-page and username→next→password
 * flows. Throws {@link LoginError} with a clear message on failure.
 */
export async function performLogin(opts: LoginOptions): Promise<LoginResult> {
  assertSafeTarget(opts.loginUrl);
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    try {
      await page.goto(opts.loginUrl, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    } catch (err) {
      throw new LoginError(`Could not open the login page: ${String(err)}`);
    }
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

    let recipe = opts.recipe;
    let usernameField = await findUsername(page, recipe);
    let passwordField = await findPassword(page, recipe);

    // If neither field is found, try the LLM to locate them.
    if (!usernameField && !passwordField) {
      const detected = await llmDetect(page);
      if (detected) {
        recipe = { ...recipe, ...detected };
        usernameField = await findUsername(page, recipe);
        passwordField = await findPassword(page, recipe);
      }
    }

    if (!usernameField && !passwordField) {
      throw new LoginError(
        'Could not find username or password fields on the login page. Provide selectors for this target.',
      );
    }

    // Fill whatever is present on this step.
    if (usernameField) await usernameField.fill(opts.username, { timeout: 5_000 }).catch(() => {});

    // Multi-step (username → Next → password): no password yet, so advance.
    if (!passwordField && usernameField) {
      const nextBtn = await findSubmit(page, recipe);
      await submit(page, nextBtn, usernameField);
      passwordField = await findPassword(page, recipe);
    }

    if (!passwordField) {
      throw new LoginError('Reached the password step but no password field was found.');
    }
    await passwordField.fill(opts.password, { timeout: 5_000 });

    const submitBtn = await findSubmit(page, recipe);
    await submit(page, submitBtn, passwordField);

    // Verify: a still-visible password field with an unchanged URL means the
    // credentials were rejected (or we scanned the wrong field).
    const stillOnLogin = await findPassword(page, recipe);
    if (stillOnLogin && (await stillOnLogin.isVisible().catch(() => false))) {
      const errText = await page
        .locator('[role="alert"], .error, .alert, [class*="error" i]')
        .first()
        .innerText()
        .catch(() => '');
      throw new LoginError(
        `Login did not complete — still on a page with a password field.${errText ? ` Site said: "${errText.trim().slice(0, 160)}"` : ''}`,
      );
    }

    const storageState = await context.storageState();
    return { storageState, finalUrl: page.url() };
  } finally {
    await browser.close().catch(() => {});
  }
}
