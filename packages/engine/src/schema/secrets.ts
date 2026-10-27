import { z } from 'zod';

export const SecretsSchema = z.object({
  gmail: z.object({ user: z.string(), appPassword: z.string() }).optional(),
  outlook: z.object({ tenant: z.string().default('consumers') }).optional(),
  appsScript: z.object({ url: z.string().url(), secret: z.string().min(8) }).optional(),
});
export type Secrets = z.infer<typeof SecretsSchema>;
