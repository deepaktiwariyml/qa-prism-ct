import { randomUUID } from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

/** A live, user-driven browser session used to log in before scanning (spec: interactive scan). */
interface Session {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  lastUsed: number;
}

// reason: Playwright's storageState return type is a large structural type we
// only pass through to newContext / cookie extraction.
type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

export const BROWSER_VIEWPORT = { width: 1280, height: 800 };
const IDLE_TTL_MS = 5 * 60 * 1000;

const sessions = new Map<string, Session>();

function touch(id: string): Session | undefined {
  const s = sessions.get(id);
  if (s) s.lastUsed = Date.now();
  return s;
}

export async function createBrowserSession(url: string): Promise<{ id: string; url: string }> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: BROWSER_VIEWPORT });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch {
    // Even if the initial load is slow/blocked, keep the session so the user
    // can navigate/retry from the popup.
  }
  const id = randomUUID();
  sessions.set(id, { browser, context, page, lastUsed: Date.now() });
  return { id, url: page.url() };
}

export async function screenshot(id: string): Promise<Buffer | null> {
  const s = touch(id);
  if (!s) return null;
  try {
    return await s.page.screenshot({ type: 'jpeg', quality: 55 });
  } catch {
    return null;
  }
}

export interface InputEvent {
  type: 'click' | 'move' | 'scroll' | 'text' | 'key';
  x?: number;
  y?: number;
  deltaY?: number;
  text?: string;
  key?: string;
}

export async function forwardInput(id: string, ev: InputEvent): Promise<boolean> {
  const s = touch(id);
  if (!s) return false;
  const p = s.page;
  try {
    switch (ev.type) {
      case 'click':
        await p.mouse.click(ev.x ?? 0, ev.y ?? 0);
        break;
      case 'move':
        await p.mouse.move(ev.x ?? 0, ev.y ?? 0);
        break;
      case 'scroll':
        await p.mouse.wheel(0, ev.deltaY ?? 0);
        break;
      case 'text':
        if (ev.text) await p.keyboard.type(ev.text);
        break;
      case 'key':
        if (ev.key) await p.keyboard.press(ev.key);
        break;
    }
  } catch {
    // Ignore transient input errors (navigation mid-action, etc.).
  }
  return true;
}

export function currentUrl(id: string): string | null {
  const s = touch(id);
  return s ? s.page.url() : null;
}

/** Capture the authenticated session + current URL, then close the browser. */
export async function captureAndClose(
  id: string,
): Promise<{ url: string; storageState: StorageState } | null> {
  const s = sessions.get(id);
  if (!s) return null;
  const url = s.page.url();
  const storageState = await s.context.storageState();
  await closeBrowserSession(id);
  return { url, storageState };
}

export async function closeBrowserSession(id: string): Promise<void> {
  const s = sessions.get(id);
  if (!s) return;
  sessions.delete(id);
  try {
    await s.browser.close();
  } catch {
    // best effort
  }
}

// Reap abandoned sessions.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastUsed > IDLE_TTL_MS) void closeBrowserSession(id);
  }
}, 30_000);
sweeper.unref();
