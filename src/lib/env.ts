import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal(""));

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  CONFIG_ENCRYPTION_KEY: z.string().optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_SLUG: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_SETUP_URL: optionalUrl,
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_LAUNCH_PACK_PRICE_ID: z.string().optional(),
  STRIPE_MONITORING_PRICE_ID: z.string().optional(),
  STRIPE_AGENCY_PRICE_ID: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  SUPPORT_EMAIL: z.string().email().optional(),
  WORKER_SHARED_SECRET: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(32).optional(),
  ADMIN_EMAILS: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

export function publicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
}

export function serverEnv(): ServerEnv {
  return serverSchema.parse(process.env);
}

export function appUrl() {
  return publicEnv().NEXT_PUBLIC_APP_URL || "https://reposec.site";
}

export function isSupabaseConfigured() {
  const env = publicEnv();
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export function requireEnv<K extends keyof ServerEnv>(...keys: K[]): Required<Pick<ServerEnv, K>> {
  const env = serverEnv();
  const missing = keys.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Server configuration missing: ${missing.join(", ")}`);
  }
  return Object.fromEntries(keys.map((key) => [key, env[key]])) as Required<Pick<ServerEnv, K>>;
}
