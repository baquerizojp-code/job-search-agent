import type { Browser, BrowserContext, Page, Response } from 'playwright';

export const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const PAGE_TIMEOUT_MS = 30_000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface OpenedPage {
  context: BrowserContext;
  page: Page;
  response: Response | null;
}

/** New isolated context + page, navigated to `url` (domcontentloaded). Caller closes `context`. */
export async function openPage(browser: Browser, url: string): Promise<OpenedPage> {
  const context = await browser.newContext({
    userAgent: DESKTOP_UA,
    locale: 'en-US',
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  });
  try {
    const page = await context.newPage();
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    return { context, page, response };
  } catch (err) {
    await context.close().catch(() => undefined);
    throw err;
  }
}

/** innerText of the first matching selector that has non-empty text, else ''. */
export async function innerTextOf(page: Page, selectors: string[]): Promise<string> {
  return page.evaluate((sels: string[]) => {
    for (const sel of sels) {
      const el = document.querySelector<HTMLElement>(sel);
      const text = el?.innerText?.trim();
      if (text) return text;
    }
    return '';
  }, selectors);
}

/**
 * Visible text of `main`, else `article`, else the whole body.
 * No inner function definitions here: tsx/esbuild wraps them in a `__name`
 * helper that does not exist inside the page.
 */
export async function mainText(page: Page): Promise<string> {
  return page.evaluate(() => {
    for (const sel of ['main', 'article']) {
      const text = document.querySelector<HTMLElement>(sel)?.innerText?.trim();
      if (text) return text;
    }
    return document.body?.innerText?.trim() || '';
  });
}

/** Best-effort click on "show more" style buttons; never throws. */
export async function expandMore(page: Page, selector = 'button[aria-label*="more" i]'): Promise<void> {
  try {
    const buttons = page.locator(selector);
    const count = Math.min(await buttons.count(), 3);
    for (let i = 0; i < count; i++) {
      await buttons.nth(i).click({ timeout: 2_000 }).catch(() => undefined);
    }
  } catch {
    // ignore
  }
}

export async function scrollToBottom(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => undefined);
}

/** Error message without the Playwright call-log noise. */
export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.split('\n')[0]?.trim() || 'unknown error';
}
