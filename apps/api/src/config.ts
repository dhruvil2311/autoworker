import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..", "..");
const isTest = process.env.NODE_ENV === "test";
const candidatePaths = isTest
  ? [path.resolve(projectRoot, ".env.test"), path.resolve(process.cwd(), ".env.test")]
  : [path.resolve(projectRoot, ".env"), path.resolve(process.cwd(), ".env")];

for (const candidatePath of candidatePaths) {
  dotenv.config({ path: candidatePath, override: true });
}

const configSchema = z.object({
  nodeEnv: z.string().default("development"),
  port: z.coerce.number().int().positive().default(4000),
  appUrl: z.string().url().default("http://localhost:5173"),
  apiUrl: z.string().url().default("http://localhost:4000"),
  supabaseUrl: z.string().url().or(z.literal("")).optional(),
  supabaseAnonKey: z.string().or(z.literal("")).optional(),
  supabaseServiceRoleKey: z.string().or(z.literal("")).optional(),
  storageProvider: z.enum(["auto", "memory", "supabase"]).default("auto"),
  allowDevAuth: z.boolean().default(false),
  devAuthEnabled: z.boolean().default(false),
  devAuthEmail: z.string().default("admin@ghost.local"),
  devAuthPassword: z.string().default("Ghost@123456"),
  devAuthUserId: z.string().default("00000000-0000-0000-0000-000000000002"),
  allowInMemoryStorage: z.boolean().default(false),
  geminiApiKey: z.string().optional(),
  geminiModel: z.string().default("gemini-2.0-flash"),
  geminiBaseUrl: z.string().url().default("https://generativelanguage.googleapis.com/v1beta/openai"),
  groqApiKey: z.string().optional(),
  groqModel: z.string().optional(),
  groqBaseUrl: z.string().url().optional(),
  openRouterApiKey: z.string().optional(),
  openRouterModel: z.string().default("qwen/qwen3.8-27b:free"),
  openRouterVisionModel: z.string().default("qwen/qwen3.8-27b:free"),
  openRouterReasoningModel: z.string().default("qwen/qwen3.8-27b:free"),
  openRouterBaseUrl: z.string().url().default("https://openrouter.ai/api/v1"),
  openRouterSiteUrl: z.string().optional(),
  openRouterSiteName: z.string().optional(),
  allowPaidModels: z.boolean().default(false),
  openRouterMaxConcurrentRequests: z.coerce.number().int().positive().default(1),
  openRouterMaxRetries: z.coerce.number().int().nonnegative().default(1),
  // Vision-capable models to try when the primary vision model fails for a provider-side reason.
  // Only models listed here are used; nothing is substituted implicitly.
  openRouterFallbackVisionModels: z.array(z.string()).default([]),
  openRouterRequestTimeoutMs: z.coerce.number().int().positive().default(60_000),
  maxLlmImagesPerRequest: z.coerce.number().int().positive().default(6),
  maxLlmImagesTotal: z.coerce.number().int().positive().default(120),
  videoSampleFps: z.coerce.number().positive().default(1),
  maxFramesPerSegment: z.coerce.number().int().positive().default(4),
  maxSegmentsPerVideo: z.coerce.number().int().positive().default(20),
  enableWorkflowCritic: z.boolean().default(false),
  analysisMode: z.enum(["FAST", "BALANCED", "DEEP"]).default("FAST"),
  fallbackLlmApiKey: z.string().optional(),
  fallbackLlmModel: z.string().optional(),
  fallbackLlmBaseUrl: z.string().url().optional(),
  enableVisionLlmOcr: z.boolean().optional(),
  browserbaseApiKey: z.string().optional(),
  browserbaseProjectId: z.string().optional(),
  webhookSigningSecret: z.string().optional(),
  encryptionKey: z.string().optional(),
  redisUrl: z.string().optional(),
  sentryDsn: z.string().optional(),
  hitlSessionTimeoutSeconds: z.coerce.number().int().positive().default(300)
});

export type ApiConfig = z.infer<typeof configSchema>;

function normalizeOptionalSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (/^replace-with-your-|^your-(?:openrouter|gemini|groq)-model$/i.test(normalized)) return undefined;
  return normalized;
}

export function loadConfig(env = process.env): ApiConfig {
  const mergedEnv = { ...process.env, ...(env ?? {}) } as NodeJS.ProcessEnv;
  // Primary LLM: OpenRouter
  const openRouterApiKey = normalizeOptionalSecret(mergedEnv.OPENROUTER_API_KEY ?? mergedEnv.PRIMARY_LLM_API_KEY);
  const openRouterModel = normalizeOptionalSecret(mergedEnv.OPENROUTER_MODEL ?? mergedEnv.PRIMARY_LLM_MODEL) ?? "qwen/qwen3.8-27b:free";
  const openRouterVisionModel = normalizeOptionalSecret(mergedEnv.OPENROUTER_VISION_MODEL) ?? openRouterModel;
  const openRouterReasoningModel = normalizeOptionalSecret(mergedEnv.OPENROUTER_REASONING_MODEL) ?? openRouterModel;
  const openRouterBaseUrl = normalizeOptionalSecret(mergedEnv.OPENROUTER_BASE_URL ?? mergedEnv.PRIMARY_LLM_BASE_URL) ?? "https://openrouter.ai/api/v1";
  const openRouterSiteUrl = normalizeOptionalSecret(mergedEnv.OPENROUTER_SITE_URL);
  const openRouterSiteName = normalizeOptionalSecret(mergedEnv.OPENROUTER_SITE_NAME);
  const allowPaidModels = mergedEnv.ALLOW_PAID_MODELS === "true";
  const openRouterMaxConcurrentRequests = mergedEnv.OPENROUTER_MAX_CONCURRENT_REQUESTS ? Number(mergedEnv.OPENROUTER_MAX_CONCURRENT_REQUESTS) : 1;
  const openRouterMaxRetries = mergedEnv.OPENROUTER_MAX_RETRIES ? Number(mergedEnv.OPENROUTER_MAX_RETRIES) : 1;
  const openRouterFallbackVisionModels = (mergedEnv.OPENROUTER_FALLBACK_VISION_MODELS || "").split(",").map(m => m.trim()).filter(Boolean);
  const openRouterRequestTimeoutMs = mergedEnv.OPENROUTER_REQUEST_TIMEOUT_MS ? Number(mergedEnv.OPENROUTER_REQUEST_TIMEOUT_MS) : 60_000;
  const maxLlmImagesPerRequest = mergedEnv.MAX_LLM_IMAGES_PER_REQUEST ? Number(mergedEnv.MAX_LLM_IMAGES_PER_REQUEST) : 6;
  const maxLlmImagesTotal = mergedEnv.MAX_LLM_IMAGES_TOTAL ? Number(mergedEnv.MAX_LLM_IMAGES_TOTAL) : 120;
  const videoSampleFps = mergedEnv.VIDEO_SAMPLE_FPS ? Number(mergedEnv.VIDEO_SAMPLE_FPS) : 1;
  const maxFramesPerSegment = mergedEnv.MAX_FRAMES_PER_SEGMENT ? Number(mergedEnv.MAX_FRAMES_PER_SEGMENT) : 4;
  const maxSegmentsPerVideo = mergedEnv.MAX_SEGMENTS_PER_VIDEO ? Number(mergedEnv.MAX_SEGMENTS_PER_VIDEO) : 20;
  const enableWorkflowCritic = mergedEnv.ENABLE_WORKFLOW_CRITIC === "true";
  const analysisMode = (["FAST", "BALANCED", "DEEP"].includes(mergedEnv.ANALYSIS_MODE || "") ? mergedEnv.ANALYSIS_MODE : "FAST") as "FAST" | "BALANCED" | "DEEP";

  // Fallback LLM #1: Google Gemini
  const geminiApiKey = normalizeOptionalSecret(mergedEnv.GEMINI_API_KEY ?? mergedEnv.FALLBACK_LLM_1_API_KEY) ?? (isTest ? "test-mock-key" : undefined);
  const geminiModel = normalizeOptionalSecret(mergedEnv.GEMINI_MODEL ?? mergedEnv.FALLBACK_LLM_1_MODEL) ?? "gemini-2.0-flash";
  const geminiBaseUrl = normalizeOptionalSecret(mergedEnv.GEMINI_BASE_URL ?? mergedEnv.FALLBACK_LLM_1_BASE_URL) ?? "https://generativelanguage.googleapis.com/v1beta/openai";

  // Fallback LLM #2: Groq
  const groqApiKey = normalizeOptionalSecret(mergedEnv.GROQ_API_KEY ?? mergedEnv.FALLBACK_LLM_2_API_KEY);
  const groqModel = normalizeOptionalSecret(mergedEnv.GROQ_MODEL ?? mergedEnv.FALLBACK_LLM_2_MODEL) ?? "openai/gpt-oss-120b";
  const groqBaseUrl = normalizeOptionalSecret(mergedEnv.GROQ_BASE_URL ?? mergedEnv.FALLBACK_LLM_2_BASE_URL) ?? "https://api.groq.com/openai/v1";

  // Fallback LLM #3: Custom
  const fallbackLlmApiKey = normalizeOptionalSecret(mergedEnv.FALLBACK_LLM_API_KEY ?? mergedEnv.FALLBACK_LLM_3_API_KEY);
  const fallbackLlmModel = normalizeOptionalSecret(mergedEnv.FALLBACK_LLM_MODEL ?? mergedEnv.FALLBACK_LLM_3_MODEL);
  const fallbackLlmBaseUrl = normalizeOptionalSecret(mergedEnv.FALLBACK_LLM_BASE_URL ?? mergedEnv.FALLBACK_LLM_3_BASE_URL);

  return configSchema.parse({
    nodeEnv: mergedEnv.NODE_ENV,
    port: mergedEnv.PORT,
    appUrl: mergedEnv.APP_URL,
    apiUrl: mergedEnv.API_URL,
    supabaseUrl: mergedEnv.SUPABASE_URL,
    supabaseAnonKey: mergedEnv.SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: mergedEnv.SUPABASE_SERVICE_ROLE_KEY,
    storageProvider: mergedEnv.STORAGE_PROVIDER,
    allowDevAuth: mergedEnv.ALLOW_DEV_AUTH === "true" || mergedEnv.DEV_AUTH_ENABLED === "true",
    devAuthEnabled: mergedEnv.DEV_AUTH_ENABLED === "true" || (mergedEnv.NODE_ENV !== "production" && mergedEnv.ALLOW_DEV_AUTH === "true"),
    devAuthEmail: normalizeOptionalSecret(mergedEnv.DEV_AUTH_EMAIL) ?? "admin@ghost.local",
    devAuthPassword: normalizeOptionalSecret(mergedEnv.DEV_AUTH_PASSWORD) ?? "Ghost@123456",
    devAuthUserId: mergedEnv.DEV_AUTH_USER_ID ?? "00000000-0000-0000-0000-000000000002",
    allowInMemoryStorage: mergedEnv.ALLOW_MEMORY_STORAGE === "true",
    geminiApiKey,
    geminiModel,
    geminiBaseUrl,
    groqApiKey,
    groqModel,
    groqBaseUrl,
    openRouterApiKey,
    openRouterModel,
    openRouterVisionModel,
    openRouterReasoningModel,
    openRouterBaseUrl,
    openRouterSiteUrl,
    openRouterSiteName,
    allowPaidModels,
    openRouterMaxConcurrentRequests,
    openRouterMaxRetries,
    openRouterFallbackVisionModels,
    openRouterRequestTimeoutMs,
    maxLlmImagesPerRequest,
    maxLlmImagesTotal,
    videoSampleFps,
    maxFramesPerSegment,
    maxSegmentsPerVideo,
    enableWorkflowCritic,
    analysisMode,
    fallbackLlmApiKey,
    fallbackLlmModel,
    fallbackLlmBaseUrl,
    enableVisionLlmOcr: mergedEnv.ENABLE_VISION_LLM_OCR === "true" || mergedEnv.ENABLE_VISION_LLM_OCR === "1",
    browserbaseApiKey: normalizeOptionalSecret(mergedEnv.BROWSERBASE_API_KEY) ?? (isTest ? "test-bb-key" : undefined),
    browserbaseProjectId: normalizeOptionalSecret(mergedEnv.BROWSERBASE_PROJECT_ID),
    webhookSigningSecret: normalizeOptionalSecret(mergedEnv.WEBHOOK_SIGNING_SECRET),
    encryptionKey: normalizeOptionalSecret(mergedEnv.ENCRYPTION_KEY),
    redisUrl: normalizeOptionalSecret(mergedEnv.REDIS_URL),
    sentryDsn: normalizeOptionalSecret(mergedEnv.SENTRY_DSN),
    hitlSessionTimeoutSeconds: mergedEnv.HITL_SESSION_TIMEOUT_SECONDS
  });
}
