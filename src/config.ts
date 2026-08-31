import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  ADMIN_API_KEY: z.string().min(16, 'ADMIN_API_KEY must be at least 16 characters'),
  ADMIN_PASSWORD: z.string().default(''),
  ADMIN_NAME: z.string().trim().min(1).max(80).default('Admin'),
  SESSION_SECRET: z.string().default(''),
  CORS_ORIGIN: z.string().default('*'),
  INTRO_CALL_MEETING_URL: z.string().url(),
  COACH_EMAIL: z.string().email(),
  MICROSOFT_TENANT_ID: z.string().default(''),
  MICROSOFT_CLIENT_ID: z.string().default(''),
  MICROSOFT_CLIENT_SECRET: z.string().default(''),
  MICROSOFT_COACH_UPN: z.string().email().or(z.literal('')).default(''),
  MICROSOFT_COACH_USER_ID: z.string().default(''),
  MAIL_FROM: z.string().min(3).default('AI Trainers <hello@aitrainers.coach>'),
  RESEND_API_KEY: z.string().optional().default(''),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${details}`);
  }
  return parsed.data;
}

export const config = loadConfig();

export const corsOrigins = config.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const corsOriginOption: true | string[] = corsOrigins.includes('*')
  ? true
  : corsOrigins;

export function parseMailbox(value: string): { name: string; email: string } {
  const angled = /^(.*?)\s*<([^>]+)>$/.exec(value.trim());
  if (angled?.[1] && angled[2]) {
    return {
      name: angled[1].replace(/^"|"$/g, '').trim() || 'AI Trainers',
      email: angled[2].trim().toLowerCase(),
    };
  }
  return { name: 'AI Trainers', email: value.trim().toLowerCase() };
}

export const mailFrom = parseMailbox(config.MAIL_FROM);

export function adminLoginSecret(): string {
  const password = config.ADMIN_PASSWORD.trim();
  return password.length >= 16 ? password : config.ADMIN_API_KEY;
}

export function sessionSigningSecret(): string {
  const explicit = config.SESSION_SECRET.trim();
  if (explicit.length >= 32) {
    return explicit;
  }
  if (config.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be at least 32 characters in production');
  }
  return `dev-session:${config.ADMIN_API_KEY}`.padEnd(32, 'x');
}
