import { chromium } from 'playwright';
import sharp from 'sharp';

/** Viewport used for the scan screenshot — matches the interactive session. */
const CAPTURE_VIEWPORT = { width: 1280, height: 800 };
const NAV_TIMEOUT_MS = 30_000;
const THUMB_WIDTH = 400;

export interface Capture {
  screenshot: Buffer;
  thumbnail: Buffer;
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
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext(
      storageState
        ? ({ viewport: CAPTURE_VIEWPORT, storageState } as Parameters<
            typeof browser.newContext
          >[0])
        : { viewport: CAPTURE_VIEWPORT },
    );
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
    // A short settle so late-loading hero imagery/fonts are in the shot.
    await page.waitForTimeout(600).catch(() => {});
    const raw = await page.screenshot({ type: 'jpeg', quality: 70 });

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
