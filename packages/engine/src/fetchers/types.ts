import type { Lead, Posting } from '../schema/index.js';
import type { Logger } from '../core/logger.js';
import type { Browser } from 'playwright';

export interface FetchContext {
  log: Logger;
  /** Lazily started Chromium; fetchers call browser() only when they need it. */
  browser: () => Promise<Browser>;
  descriptionMaxChars: number;
}

export interface FetchResult {
  title?: string;
  company?: string;
  location?: string;
  description: string;
  /** True when the description was cut to descriptionMaxChars. */
  descriptionTruncated?: boolean;
  status: Posting['fetchStatus'];
  error?: string;
}

export interface Fetcher {
  readonly name: string;
  matches(lead: Lead): boolean;
  fetch(lead: Lead, ctx: FetchContext): Promise<FetchResult>;
}
