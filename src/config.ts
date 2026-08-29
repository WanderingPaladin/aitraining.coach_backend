import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  ADMIN_API_KEY: z.string().min(16, 'ADMIN_API_KEY must be at least 16 characters'),
  CORS_ORIGIN: z.string().default('*'),
  INTRO_CALL_MEETING_URL: z.string().url(),
  COACH_EMAIL: z.string().email(),
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
