/** Options for one deterministic project compilation; generation IDs isolate module imports. */
export interface CheckOptions {
  readonly projectRoot?: string;
  readonly configPath?: string;
  readonly config?: unknown;
  readonly generationId?: string;
  readonly timeoutMs?: number;
  readonly environmentAllowlist?: readonly string[];
  readonly networkAllowlist?: readonly string[];
  readonly signal?: AbortSignal;
  readonly mode?: "development" | "test" | "production";
}

/** Source text and its portable path relative to the project. */
export interface CheckSource {
  readonly fileName: string;
  readonly text: string;
}
