import { z } from "zod"
import { LLMProvider } from "../../domain/enums/LLMProvider.js"

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    // Loopback by default: in production only the reverse proxy (Apache) may reach the app.
    HOST: z.string().min(1).default("127.0.0.1"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),

    MONGO_URL: z.string().min(1),
    MONGO_DB_NAME: z.string().min(1).default("rag"),

    LLM_PROVIDER: z
      .string()
      .default(LLMProvider.KIMI)
      .transform((value) => value.toUpperCase())
      .pipe(z.enum(LLMProvider)),
    LLM_MAX_TOKENS: z.coerce.number().int().positive().default(20048),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),

    KIMI_API_KEY: z.string().min(1).optional(),
    KIMI_MODEL: z.string().min(1).default("kimi-k3"),
    KIMI_BASE_URL: z.url().default("https://api.moonshot.ai/v1"),
    KIMI_REASONING_EFFORT: z.enum(["low", "high", "max"]).optional(),

    // Always required: embeddings are generated with Mistral regardless of the completion provider.
    MISTRAL_API_KEY: z.string().min(1),
    MISTRAL_MODEL: z.string().min(1).default("mistral-large-latest"),
    MISTRAL_EMBED_MODEL: z.string().min(1).default("mistral-embed"),

    RATE_LIMIT_MAX_MESSAGES: z.coerce.number().int().positive().default(20),
    RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().positive().default(60),

    RAG_VECTOR_INDEX: z.string().min(1).default("vector_index"),
    RAG_RETRIEVE_K: z.coerce.number().int().positive().default(6),
    RAG_SCORE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
    HISTORY_MAX_MESSAGES: z.coerce.number().int().min(0).default(20),
    MAX_MESSAGE_LENGTH: z.coerce.number().int().positive().default(4000),

    SSE_HEARTBEAT_MS: z.coerce.number().int().positive().default(15_000)
  })
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER === LLMProvider.KIMI && !env.KIMI_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["KIMI_API_KEY"], message: "Required when LLM_PROVIDER is KIMI" })
    }
    if (env.NODE_ENV === "production" && env.CORS_ORIGIN.split(",").some((origin) => origin.trim() === "*")) {
      ctx.addIssue({ code: "custom", path: ["CORS_ORIGIN"], message: "Wildcard origin is not allowed in production" })
    }
  })

const loadConfig = (source: NodeJS.ProcessEnv) => {
  // Blank variables (e.g. `KIMI_API_KEY=` in a .env file) are treated as not set.
  const env = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined && value !== ""))
  const parsed = EnvSchema.safeParse(env)
  if (!parsed.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(parsed.error)}`)
  }
  const e = parsed.data

  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    corsOrigins: e.CORS_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    mongo: { url: e.MONGO_URL, dbName: e.MONGO_DB_NAME },
    llm: {
      provider: e.LLM_PROVIDER,
      maxTokens: e.LLM_MAX_TOKENS,
      timeoutMs: e.LLM_TIMEOUT_MS,
      kimi: {
        apiKey: e.KIMI_API_KEY,
        model: e.KIMI_MODEL,
        baseUrl: e.KIMI_BASE_URL,
        reasoningEffort: e.KIMI_REASONING_EFFORT
      },
      mistral: { apiKey: e.MISTRAL_API_KEY, model: e.MISTRAL_MODEL, embedModel: e.MISTRAL_EMBED_MODEL }
    },
    rateLimit: { maxMessages: e.RATE_LIMIT_MAX_MESSAGES, windowMinutes: e.RATE_LIMIT_WINDOW_MINUTES },
    rag: { vectorIndex: e.RAG_VECTOR_INDEX, retrieveK: e.RAG_RETRIEVE_K, scoreThreshold: e.RAG_SCORE_THRESHOLD },
    historyMaxMessages: e.HISTORY_MAX_MESSAGES,
    maxMessageLength: e.MAX_MESSAGE_LENGTH,
    sseHeartbeatMs: e.SSE_HEARTBEAT_MS
  }
}

export type AppConfig = ReturnType<typeof loadConfig>

export { loadConfig }
