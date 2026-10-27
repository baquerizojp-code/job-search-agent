import type { Lead, MailMessage } from '../../schema/index.js';

/** Turns one alert email into zero or more leads. */
export interface EmailExtractor {
  readonly name: string;
  /** Whether this extractor owns the message (by sender, usually). */
  matches(msg: MailMessage): boolean;
  extract(msg: MailMessage): Lead[];
}
