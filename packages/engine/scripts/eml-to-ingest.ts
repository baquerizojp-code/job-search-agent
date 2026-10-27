/**
 * Dev helper: turn .eml files into the JSON that `jobsearch ingest --input` expects.
 *   tsx scripts/eml-to-ingest.ts out.json a.eml b.eml ...
 */
import fs from 'node:fs';
import path from 'node:path';
import { simpleParser } from 'mailparser';
import { toMailMessage } from '../src/providers/mail/gmail-imap.js';

const [out, ...files] = process.argv.slice(2);
if (!out || files.length === 0) {
  console.error('usage: tsx scripts/eml-to-ingest.ts out.json a.eml [b.eml ...]');
  process.exit(1);
}
const messages = [];
for (const f of files) {
  const parsed = await simpleParser(fs.readFileSync(f));
  messages.push(toMailMessage(parsed, `eml:${path.basename(f)}`));
}
fs.writeFileSync(out, JSON.stringify({ provider: 'host-connector', messages }, null, 2));
console.log(`${messages.length} messages -> ${out}`);
