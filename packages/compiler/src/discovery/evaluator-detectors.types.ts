import type { Effect, Schema } from "effect";
import type {
  EvaluatorDetectorOptionsSchema,
  EvaluatorDetectorReportSchema,
} from "./evaluator-detectors.js";

/** Candidate sandbox roots and explicit network permissions. */
export interface EvaluatorDetectorOptions extends Schema.Schema.Type<
  typeof EvaluatorDetectorOptionsSchema
> {}

/** Immutable observations captured before candidate hooks are released. */
export interface EvaluatorDetectorReport extends Schema.Schema.Type<
  typeof EvaluatorDetectorReportSchema
> {}

/** Scoped native capabilities; callers must not retain this session beyond its owner. */
export interface EvaluatorDetectorSession {
  /**
   * Drains surviving timers and snapshots captured output.
   * @returns A lazy effect yielding the report; unexpected native cancellation failures are defects.
   */
  readonly finishEffect: () => Effect.Effect<EvaluatorDetectorReport>;

  /**
   * Releases all hooks and timers, attempting every release even if another throws.
   * @returns A lazy effect; aggregated release failures remain defects.
   * @remarks Cleanup is uninterruptible, including explicit release before scope closure.
   */
  readonly restoreEffect: () => Effect.Effect<void>;

  /**
   * Synchronous compatibility boundary for native consumers.
   * @returns The detector report after draining timers.
   */
  finish(): EvaluatorDetectorReport;

  /**
   * Synchronous compatibility boundary for native consumers.
   * @returns Nothing after releasing the session.
   */
  restore(): void;
}
