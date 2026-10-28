import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));

loadDotenv({
  path: ['.env', rootEnvPath],
  quiet: true,
});

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LIVEKIT_URL: z
    .string()
    .trim()
    .default('')
    .refine(
      (url) => url === '' || ((url.startsWith('ws://') || url.startsWith('wss://')) && isUrl(url)),
      'Informe uma URL ws:// ou wss:// válida.',
    ),
  LIVEKIT_API_KEY: z.string().trim().default(''),
  LIVEKIT_API_SECRET: z.string().trim().default(''),
  WEB_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  VERCEL_URL: z.string().trim().default(''),
  VERCEL_BRANCH_URL: z.string().trim().default(''),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().trim().default(''),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(600),
  MAX_PARTICIPANTS: z.coerce.number().int().min(2).max(100).default(100),
  RESERVED_ROOMS: booleanString,
  ALLOWED_ROOMS: z.string().default(''),
  MEETING_MODE: z.enum(['standard', 'high-reliability']).default('high-reliability'),
  ENABLE_ADVANCED_NOISE_FILTER: booleanString,
  DATABASE_URL: z.string().trim().default(''),
  QUESTION_STORE_PATH: z.string().trim().min(1).default('.data/questions.json'),
});

export type ServerConfig = ReturnType<typeof loadConfig>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid server configuration: ${message}`);
  }

  const livekitConfigured =
    parsed.data.LIVEKIT_URL.length > 0 &&
    parsed.data.LIVEKIT_API_KEY.length > 0 &&
    parsed.data.LIVEKIT_API_SECRET.length >= 8;

  if (parsed.data.NODE_ENV === 'production' && !livekitConfigured) {
    throw new Error(
      'Invalid server configuration: LIVEKIT_URL, LIVEKIT_API_KEY e LIVEKIT_API_SECRET são obrigatórios em produção.',
    );
  }
  if (parsed.data.NODE_ENV === 'production' && !parsed.data.DATABASE_URL) {
    throw new Error(
      'Invalid server configuration: DATABASE_URL é obrigatório em produção para persistir as perguntas.',
    );
  }

  return {
    nodeEnv: parsed.data.NODE_ENV,
    livekitUrl: parsed.data.LIVEKIT_URL,
    livekitConfigured,
    livekitApiKey: parsed.data.LIVEKIT_API_KEY,
    livekitApiSecret: parsed.data.LIVEKIT_API_SECRET,
    webOrigins: collectWebOrigins(parsed.data),
    port: parsed.data.PORT,
    host: parsed.data.HOST,
    logLevel: parsed.data.LOG_LEVEL,
    tokenTtlSeconds: parsed.data.TOKEN_TTL_SECONDS,
    maxParticipants: parsed.data.MAX_PARTICIPANTS,
    reservedRooms: parsed.data.RESERVED_ROOMS,
    allowedRooms: new Set(
      parsed.data.ALLOWED_ROOMS.split(',')
        .map((room) => room.trim())
        .filter(Boolean),
    ),
    meetingMode: parsed.data.MEETING_MODE,
    advancedNoiseFilterEnabled: parsed.data.ENABLE_ADVANCED_NOISE_FILTER,
    databaseUrl: parsed.data.DATABASE_URL,
    questionStorePath: parsed.data.QUESTION_STORE_PATH,
  } as const;
}

function collectWebOrigins(source: {
  WEB_ORIGIN: string;
  VERCEL_URL: string;
  VERCEL_BRANCH_URL: string;
  VERCEL_PROJECT_PRODUCTION_URL: string;
}) {
  return [
    ...source.WEB_ORIGIN.split(',').map((origin) => origin.trim()),
    toHttpsOrigin(source.VERCEL_URL),
    toHttpsOrigin(source.VERCEL_BRANCH_URL),
    toHttpsOrigin(source.VERCEL_PROJECT_PRODUCTION_URL),
  ].filter(
    (origin, index, origins): origin is string =>
      Boolean(origin) && origins.indexOf(origin) === index,
  );
}

function toHttpsOrigin(hostname: string) {
  const value = hostname.trim();
  if (!value) return undefined;
  return value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;
}

function isUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}
