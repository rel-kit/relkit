/** IPC messages and the client contract of the warm development evaluator. */
import type { Effect } from "effect";
import type { EvaluatorOptions } from "./evaluator-request.types.js";
import type { EvaluatorRequest, EvaluatorResponse } from "./evaluator-protocol.types.js";

/** One evaluation request sent to the warm child. */
export interface WarmEvaluatorRequest {
  readonly id: number;
  readonly request: EvaluatorRequest;
  /** Project-relative files the caller knows changed, with their descriptor dependents. */
  readonly invalidate: readonly string[];
  /** Drops every cached snapshot first. */
  readonly full: boolean;
}

/** The warm child's answer. */
export type WarmEvaluatorReply =
  | {
      readonly id: number;
      readonly response: EvaluatorResponse;
      /** Candidates imported again for this request, project-relative. */
      readonly reimported: readonly string[];
    }
  | { readonly id: number; readonly error: string };

/** Successful warm evaluation with the candidates it imported again. */
export interface WarmEvaluation {
  readonly response: EvaluatorResponse;
  readonly reimported: readonly string[];
}

/** Session-owned warm evaluator. */
export interface WarmEvaluator {
  /**
   * Evaluates candidates, re-importing only changed modules and their dependents.
   * @param options - Ordinary evaluator options for this generation.
   * @param invalidate - Files known to have changed, with descriptor dependents.
   * @returns The response and the re-imported candidates; transport failures are defects.
   */
  readonly evaluate: (
    options: EvaluatorOptions,
    invalidate: readonly string[],
  ) => Effect.Effect<WarmEvaluation>;
  /** Stops the child; the next evaluation starts a new one. */
  readonly close: () => void;
}
