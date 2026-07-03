import { chromium, type Page } from 'playwright';
import sharp from 'sharp';

/** Viewport used for the scan screenshot — matches the interactive session. */
const CAPTURE_VIEWPORT = { width: 1280, height: 800 };
const NAV_TIMEOUT_MS = 30_000;
const THUMB_WIDTH = 400;

// Flags that keep headless screenshots reliable, especially inside containers
// (no /dev/shm, no GPU compositor) where authenticated SPAs otherwise render
// as a blank/black frame.
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--force-color-profile=srgb',
];

export interface Capture {
  screenshot: Buffer;
  thumbnail: Buffer;
}

/** A near-uniform image (all one colour) means the page hadn't painted yet. */
async function isBlank(buf: Buffer): Promise<boolean> {
  try {
    const stats = await sharp(buf).stats();
    // Entropy ~0 for a flat image; also treat tiny per-channel variance as blank.
    if (stats.entropy < 0.15) return true;
    return stats.channels.every((c) => c.stdev < 3);
  } catch {
    return false;
  }
}

/** Give a client-rendered page a real chance to paint before we shoot it. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
  // Wait for the body to actually contain something, then for web fonts. These
  // run in the browser, so pass them as strings (the API has no DOM lib).
  await page
    .waitForFunction('!!document.body && document.body.innerText.trim().length > 0', undefined, {
      timeout: 6_000,
    })
    .catch(() => {});
  await page.evaluate('document.fonts && document.fonts.ready').catch(() => {});
  await page.waitForTimeout(800).catch(() => {});
}

/**
 * Load a URL headlessly (reusing an authenticated session if given) and capture
 * a viewport JPEG plus a downscaled thumbnail. Best-effort: returns null if the
 * page can't be rendered, so it never sinks a scan.
 */
export async function captureScreenshot(
  url: string,
  storageState?: unknown,
): Promise<Capture | null> {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
    const context = await browser.newContext(
      storageState
        ? ({ viewport: CAPTURE_VIEWPORT, storageState } as Parameters<
            typeof browser.newContext
          >[0])
        : { viewport: CAPTURE_VIEWPORT },
    );
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    await settle(page);

    let raw = await page.screenshot({ type: 'jpeg', quality: 70 });
    // If the frame is blank/black the app likely hadn't finished rendering —
    // wait longer and take one more shot.
    if (await isBlank(raw)) {
      await page.waitForTimeout(2_500).catch(() => {});
      raw = await page.screenshot({ type: 'jpeg', quality: 70 });
    }

    const screenshot = await sharp(raw).jpeg({ quality: 72 }).toBuffer();
    const thumbnail = await sharp(raw)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 60 })
      .toBuffer();

    return { screenshot, thumbnail };
  } catch {
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}
