import { z } from 'zod';

/** A normalized email, whatever provider it came from. */
export const MailMessageSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().optional(),
  from: z.string().default(''),
  subject: z.string().default(''),
  date: z.string().optional(),
  text: z.string().default(''),
  html: z.string().default(''),
});
export type MailMessage = z.infer<typeof MailMessageSchema>;

/** File handed to `jobsearch ingest --input` by the agent (host-connector / host-browser modes). */
export const IngestFileSchema = z.object({
  provider: z.enum(['host-connector', 'host-browser']).default('host-connector'),
  messages: z.array(MailMessageSchema),
});
export type IngestFile = z.infer<typeof IngestFileSchema>;
