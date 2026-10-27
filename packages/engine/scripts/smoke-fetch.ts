// Manual smoke test: fetch one LinkedIn job by id (or any URL) and print the result.
//   npx tsx scripts/smoke-fetch.ts 4123456789
//   npx tsx scripts/smoke-fetch.ts https://jobs.example.com/posting/42
//   HEADLESS=0 npx tsx scripts/smoke-fetch.ts 4123456789   # watch the browser
import { fetchPostings } from '../src/fetchers/index.js';
import { canonicalLinkedInUrl, urlHash } from '../src/core/jobid.js';
import type { Lead } from '../src/schema/index.js';
import type { Logger } from '../src/core/logger.js';

const arg = process.argv[2];
if (!arg) {
  console.error('usage: tsx scripts/smoke-fetch.ts <linkedin-job-id | url>');
  process.exit(2);
}

const lead: Lead = /^\d+$/.test(arg)
  ? { source: 'linkedin', externalId: arg, url: canonicalLinkedInUrl(arg), messageIds: [] }
  : { source: 'generic', externalId: urlHash(arg), url: arg, messageIds: [] };

const log: Logger = {
  debug: (m, x) => console.error('[debug]', m, x ?? ''),
  info: (m, x) => console.error('[info]', m, x ?? ''),
  warn: (m, x) => console.error('[warn]', m, x ?? ''),
  error: (m, x) => console.error('[error]', m, x ?? ''),
  redact: () => undefined,
};

const [posting] = await fetchPostings([lead], {
  log,
  descriptionMaxChars: 12_000,
  timeBudgetSec: 120,
  headless: process.env.HEADLESS !== '0',
  maxPostings: 1,
});

console.log(JSON.stringify({
  jobId: posting!.jobId,
  status: posting!.fetchStatus,
  title: posting!.title,
  company: posting!.company,
  location: posting!.location,
  chars: posting!.description.length,
  truncated: posting!.descriptionTruncated,
  error: posting!.fetchError,
}, null, 2));
console.log('---');
console.log(posting!.description.slice(0, 300));
