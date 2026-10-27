import { z } from 'zod';
import { LeadSchema } from './lead.js';

export const FetchStatusSchema = z.enum(['ok', 'authwall', 'blocked', 'closed', 'empty', 'partial', 'pending']);
export type FetchStatus = z.infer<typeof FetchStatusSchema>;

/** A lead plus the job description, ready to be scored by the agent. */
export const PostingSchema = LeadSchema.extend({
  jobId: z.string().min(1),
  description: z.string().default(''),
  descriptionTruncated: z.boolean().default(false),
  fetchStatus: FetchStatusSchema.default('pending'),
  fetchedAt: z.string().optional(),
  fetchError: z.string().optional(),
});
export type Posting = z.infer<typeof PostingSchema>;

/** What the agent hands back when it read a posting with its own browser. */
export const AgentPostingSchema = z.object({
  url: z.string().url(),
  jobId: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  description: z.string(),
  closed: z.boolean().optional(),
});
export type AgentPosting = z.infer<typeof AgentPostingSchema>;

export const BatchFileSchema = z.object({
  run: z.string(),
  batch: z.number().int().min(1),
  postings: z.array(PostingSchema),
});
export type BatchFile = z.infer<typeof BatchFileSchema>;
