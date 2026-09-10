/** How a model call is identified for audit and determinism records. */
export interface GenerationRequest {
  system: string;
  prompt: string;
  /** Deterministic by default; callers may raise for exploration. */
  temperature?: number;
  maxOutputTokens?: number;
  seed?: number;
  /** Extra model settings passed through to the provider. */
  providerOptions?: Record<string, unknown> | undefined;
}

/** Token accounting and finish metadata from the provider. */
export interface UsageInfo {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
}

export interface StructuredResult<T> {
  object: T;
  /** Raw text exactly as the model produced it, when available. */
  rawText: string | undefined;
  finishReason: string | undefined;
  usage: UsageInfo;
  /** 1-based; 1 means the schema held on the first attempt. */
  attempts: number;
}

/** Raised when the provider call itself fails after retries. */
export class LlmRuntimeError extends Error {
  readonly provider: string | undefined;
  constructor(message: string, provider?: string) {
    super(message);
    this.name = "LlmRuntimeError";
    this.provider = provider;
  }
}

/** Raised when the model output never satisfies the schema after repair. */
export class SchemaViolationError extends Error {
  readonly attempts: number;
  readonly lastIssues: string;
  constructor(message: string, attempts: number, lastIssues: string) {
    super(message);
    this.name = "SchemaViolationError";
    this.attempts = attempts;
    this.lastIssues = lastIssues;
  }
}
