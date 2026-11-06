import { observeCompiler } from "../observability.js";
import { Effect } from "effect";
import {
  EVALUATOR_DETECTOR_COVERAGE,
  EVALUATOR_PROTOCOL,
  EVALUATOR_PROTOCOL_VERSION,
} from "./evaluator-protocol.js";
import type { EvaluatorFailure, EvaluatorResponse } from "./evaluator-protocol.types.js";

/**
 * Builds the versioned failure response after a known request or transport failure.
 * @param generationId - Identity of the failed generation, or unknown before validation.
 * @param sourceMaps - Requested source-map policy.
 * @param entry - Expected failure evidence.
 * @param stdout - Complete child stdout, when available.
 * @param stderr - Complete child stderr, when available.
 * @returns A lazy effect yielding a data-only failure response.
 */
export const failedResponseEffect = Effect.fn("Discovery.failedResponse")(
  function* (
    generationId: string,
    sourceMaps: boolean,
    entry: EvaluatorFailure,
    stdout = "",
    stderr = "",
  ) {
    return {
      protocol: EVALUATOR_PROTOCOL,
      version: EVALUATOR_PROTOCOL_VERSION,
      generationId,
      sourceMaps,
      status: "failed",
      modules: [],
      failures: [
        { ...entry, ...(stdout === "" ? {} : { stdout }), ...(stderr === "" ? {} : { stderr }) },
      ],
      detectorCoverage: EVALUATOR_DETECTOR_COVERAGE,
      stdout,
      stderr,
    } satisfies EvaluatorResponse;
  },
  (effect, generationId, sourceMaps, entry, stdout = "", stderr = "") =>
    observeCompiler("discovery", "failedResponse", effect, () => ({ diagnostics: 1 }), false),
);
