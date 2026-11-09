import type { Effect } from "effect";
import type {
  EvaluatorOptions,
  EvaluatorResponse,
  WatchDependencyIndex,
} from "../compiler/index.js";
import type { CliAdapterError } from "../cli-errors.js";

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
  /** False skips type-checking; `relkit dev` type-checks in a parallel watch process instead. */
  readonly typecheck?: boolean;
  /**
   * Replaces the one-shot evaluator child, as the warm development evaluator does.
   * @param options - Candidates and evaluator policy for this generation.
   * @returns The evaluator response.
   */
  readonly evaluate?: (
    options: EvaluatorOptions,
  ) => Effect.Effect<EvaluatorResponse, CliAdapterError>;
  /**
   * Receives the watch dependency index of a successful normalization.
   * @param index - Source ownership and reverse descriptor dependencies.
   */
  readonly onWatchIndex?: (index: WatchDependencyIndex) => void;
}

/** Source text and its portable path relative to the project. */
export interface CheckSource {
  readonly fileName: string;
  readonly text: string;
}
