/** Native operations owned by one accepted agent run. */
export interface AgentRunSupervisionOptions {
  readonly renew: () => Promise<void>;
  readonly controls: (signal: AbortSignal) => Promise<void>;
  readonly abort: (cause: unknown) => void;
}
