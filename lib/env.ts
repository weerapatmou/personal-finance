import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url().optional(),
  EMAIL_SERVER: z.string(),
  EMAIL_FROM: z.string().email(),
  ALLOWED_EMAIL: z.string().email(),
  CRON_SECRET: z.string().min(16),
  OVER_BUDGET_THRESHOLD_PCT: z.coerce.number().min(0).default(10),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  DIRECT_URL: process.env.DIRECT_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_URL: process.env.AUTH_URL,
  EMAIL_SERVER: process.env.EMAIL_SERVER,
  EMAIL_FROM: process.env.EMAIL_FROM,
  ALLOWED_EMAIL: process.env.ALLOWED_EMAIL,
  CRON_SECRET: process.env.CRON_SECRET,
  OVER_BUDGET_THRESHOLD_PCT: process.env.OVER_BUDGET_THRESHOLD_PCT,
});

export type Env = z.infer<typeof envSchema>;
