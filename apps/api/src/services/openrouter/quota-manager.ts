import { logger } from "@ghost/observability";
import { OpenRouterError } from "./types.js";

export interface QuotaConfig {
  allowPaidModels: boolean;
  maxConcurrentRequests: number;
  maxRequestsPerMinute: number;
  maxRequestsPerDay: number;
  maxRetries: number;
  circuitBreakerThreshold: number;
  circuitBreakerCooldownMs: number;
}

export interface QuotaSnapshot {
  state: "READY" | "RATE_LIMITED" | "AI_QUOTA_EXHAUSTED" | "CIRCUIT_OPEN";
  activeRequests: number;
  requestsThisMinute: number;
  requestsToday: number;
  consecutiveFailures: number;
  circuitBreakerOpenUntil?: string | undefined;
  totalRequests: number;
  totalTokensEstimate: number;
}

export class OpenRouterQuotaManager {
  private static instance: OpenRouterQuotaManager;

  private activeRequests: number = 0;
  private minuteRequestTimestamps: number[] = [];
  private dailyRequestCount: number = 0;
  private dailyResetTimestamp: number = 0;
  private consecutiveFailures: number = 0;
  private circuitBreakerOpenUntil: number = 0;
  private totalRequests: number = 0;
  private totalTokensEstimate: number = 0;

  private config: QuotaConfig = {
    allowPaidModels: false,
    maxConcurrentRequests: 1,
    maxRequestsPerMinute: 20,
    maxRequestsPerDay: 500,
    maxRetries: 1,
    circuitBreakerThreshold: 3,
    circuitBreakerCooldownMs: 60_000
  };

  public constructor(configOverride?: Partial<QuotaConfig>) {
    if (configOverride) {
      this.config = { ...this.config, ...configOverride };
    }
    this.resetDailyCounterIfNeeded();
  }

  public static getInstance(configOverride?: Partial<QuotaConfig>): OpenRouterQuotaManager {
    if (!OpenRouterQuotaManager.instance) {
      OpenRouterQuotaManager.instance = new OpenRouterQuotaManager();
    }
    if (configOverride) {
      OpenRouterQuotaManager.instance.updateConfig(configOverride);
    }
    return OpenRouterQuotaManager.instance;
  }

  public updateConfig(configOverride: Partial<QuotaConfig>): void {
    this.config = { ...this.config, ...configOverride };
  }

  private resetDailyCounterIfNeeded(): void {
    const now = Date.now();
    const startOfTodayUtc = new Date(new Date().toUTCString()).setUTCHours(0, 0, 0, 0);
    if (now >= this.dailyResetTimestamp + 86400000 || this.dailyResetTimestamp === 0) {
      this.dailyResetTimestamp = startOfTodayUtc;
      this.dailyRequestCount = 0;
    }
  }

  /**
   * Cost Guard: Validates that the requested model is free when paid models are disabled.
   */
  public checkCostGuard(modelName: string): void {
    if (this.config.allowPaidModels) {
      return;
    }

    const trimmed = modelName.trim().toLowerCase();
    const isFree =
      trimmed === "qwen/qwen3.8-27b:free" ||
      trimmed.startsWith("qwen/qwen3.8-27b:free:") ||
      trimmed.endsWith(":free") ||
      trimmed.includes(":free") ||
      trimmed === "openrouter/free" ||
      trimmed.endsWith("/free");

    if (!isFree) {
      const msg = `Cost Guard blocked request: Model '${modelName}' is not free, and ALLOW_PAID_MODELS is false. Use ':free' models or 'qwen/qwen3.8-27b:free' to prevent unwanted charges.`;
      logger.error({ model: modelName, allowPaidModels: false }, msg);
      throw new OpenRouterError("COST_GUARD_VIOLATION", msg, 400);
    }
  }

  /**
   * Verifies quota availability before issuing an API call.
   * Throws typed OpenRouterError if quota is exhausted or circuit is open.
   */
  public checkQuota(): void {
    const now = Date.now();
    this.resetDailyCounterIfNeeded();

    // 1. Check Circuit Breaker
    if (now < this.circuitBreakerOpenUntil) {
      const waitSeconds = Math.ceil((this.circuitBreakerOpenUntil - now) / 1000);
      throw new OpenRouterError(
        "AI_QUOTA_EXHAUSTED",
        `OpenRouter circuit breaker is active due to consecutive provider errors. Cooldown in effect for ${waitSeconds}s.`,
        429
      );
    }

    // 2. Check Concurrency
    if (this.activeRequests >= this.config.maxConcurrentRequests) {
      throw new OpenRouterError(
        "RATE_LIMITED",
        `OpenRouter concurrency limit reached (${this.activeRequests}/${this.config.maxConcurrentRequests} in-flight).`,
        429
      );
    }

    // 3. Clean up sliding minute window
    this.minuteRequestTimestamps = this.minuteRequestTimestamps.filter(t => now - t < 60_000);
    if (this.minuteRequestTimestamps.length >= this.config.maxRequestsPerMinute) {
      throw new OpenRouterError(
        "RATE_LIMITED",
        `OpenRouter per-minute rate limit reached (${this.minuteRequestTimestamps.length}/${this.config.maxRequestsPerMinute} requests).`,
        429
      );
    }

    // 4. Check Daily Limit
    if (this.dailyRequestCount >= this.config.maxRequestsPerDay) {
      throw new OpenRouterError(
        "AI_QUOTA_EXHAUSTED",
        `OpenRouter daily request budget exhausted (${this.dailyRequestCount}/${this.config.maxRequestsPerDay} requests today).`,
        429
      );
    }
  }

  /**
   * Acquire execution slot.
   */
  public acquireSlot(): void {
    this.checkQuota();
    this.activeRequests++;
    const now = Date.now();
    this.minuteRequestTimestamps.push(now);
    this.dailyRequestCount++;
    this.totalRequests++;
  }

  /**
   * Release execution slot and record success.
   */
  public recordSuccess(tokensEstimate?: number): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.consecutiveFailures = 0;
    if (tokensEstimate) {
      this.totalTokensEstimate += tokensEstimate;
    }
  }

  public isCircuitOpen(): boolean {
    return Date.now() < this.circuitBreakerOpenUntil;
  }

  public getActiveRequests(): number {
    return this.activeRequests;
  }

  public checkRateLimit(): void {
    this.checkQuota();
  }

  public acquire(): void {
    this.acquireSlot();
  }

  public release(): void {
    this.recordSuccess();
  }

  /**
   * Release execution slot and record failure.
   */
  public recordFailure(statusCodeOrError?: number | OpenRouterError | Error, errorMessage?: string): void {
    this.activeRequests = Math.max(0, this.activeRequests - 1);
    this.consecutiveFailures++;

    let statusCode: number | undefined;
    let message = errorMessage;

    if (statusCodeOrError instanceof OpenRouterError) {
      statusCode = statusCodeOrError.statusCode;
      message = statusCodeOrError.message;
    } else if (typeof statusCodeOrError === "number") {
      statusCode = statusCodeOrError;
    } else if (statusCodeOrError instanceof Error) {
      message = statusCodeOrError.message;
    }

    // Trip circuit breaker on repeated 429, 402, or 5xx failures
    if (
      statusCode === 429 ||
      statusCode === 402 ||
      (statusCode && statusCode >= 500) ||
      this.consecutiveFailures >= this.config.circuitBreakerThreshold
    ) {
      this.circuitBreakerOpenUntil = Date.now() + this.config.circuitBreakerCooldownMs;
      logger.warn(
        {
          statusCode,
          failures: this.consecutiveFailures,
          cooldownMs: this.config.circuitBreakerCooldownMs,
          error: message
        },
        "OpenRouter circuit breaker tripped! Pausing outbound requests."
      );
    }
  }

  public getSnapshot(): QuotaSnapshot {
    const now = Date.now();
    let state: QuotaSnapshot["state"] = "READY";
    if (now < this.circuitBreakerOpenUntil) {
      state = "CIRCUIT_OPEN";
    } else if (this.minuteRequestTimestamps.filter(t => now - t < 60_000).length >= this.config.maxRequestsPerMinute) {
      state = "RATE_LIMITED";
    } else if (this.dailyRequestCount >= this.config.maxRequestsPerDay) {
      state = "AI_QUOTA_EXHAUSTED";
    }

    return {
      state,
      activeRequests: this.activeRequests,
      requestsThisMinute: this.minuteRequestTimestamps.filter(t => now - t < 60_000).length,
      requestsToday: this.dailyRequestCount,
      consecutiveFailures: this.consecutiveFailures,
      circuitBreakerOpenUntil: this.circuitBreakerOpenUntil > now ? new Date(this.circuitBreakerOpenUntil).toISOString() : undefined,
      totalRequests: this.totalRequests,
      totalTokensEstimate: this.totalTokensEstimate
    };
  }

  public resetForTesting(): void {
    this.activeRequests = 0;
    this.minuteRequestTimestamps = [];
    this.dailyRequestCount = 0;
    this.consecutiveFailures = 0;
    this.circuitBreakerOpenUntil = 0;
  }
}
