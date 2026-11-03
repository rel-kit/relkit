import { Effect } from "effect";
import { observeCompiler } from "../observability.js";
import {
  EvaluatorFailure as FailureSchema,
  EvaluatorResponse as ResponseSchema,
} from "./evaluator-protocol-schema.js";
import {
  EVALUATOR_DETECTOR_COVERAGE,
  EVALUATOR_PROTOCOL,
  EVALUATOR_PROTOCOL_VERSION,
} from "./evaluator-protocol.js";
import type {
  EvaluatorFailure,
  EvaluatorModuleResult,
  EvaluatorRequest,
} from "./evaluator-protocol.types.js";

/**
 * Builds one complete response preserving candidate and diagnostic order.
 * @param request - Accepted generation identity and source-map policy.
 * @param modules - Successful candidate snapshots in input order.
 * @param failures - Expected candidate failures in input order.
 * @param stdout - Captured candidate standard output.
 * @param stderr - Captured candidate standard error.
 * @returns A lazy effect yielding the framed transport model.
 */
export const evaluatorResponse = Effect.fn("Discovery.buildEvaluatorResponse")(
  function* (
    request: Pick<EvaluatorRequest, "generationId" | "sourceMaps">,
    modules: readonly EvaluatorModuleResult[],
    failures: readonly EvaluatorFailure[],
    stdout: string,
    stderr: string,
  ) {
    return ResponseSchema.make({
      protocol: EVALUATOR_PROTOCOL,
      version: EVALUATOR_PROTOCOL_VERSION,
      generationId: request.generationId,
      sourceMaps: request.sourceMaps,
      detectorCoverage: EVALUATOR_DETECTOR_COVERAGE,
      status: failures.length === 0 ? "ok" : "failed",
      modules: Object.freeze([...modules]),
      failures: Object.freeze([...failures]),
      stdout,
      stderr,
    });
  },
  (effect, _request, modules, failures) =>
    observeCompiler(
      "discovery",
      "evaluatorResponse",
      effect,
      () => ({ files: modules.length, diagnostics: failures.length }),
      false,
    ),
);

/**
 * Translates an expected native failure to a candidate import diagnostic.
 * @param error - Rejected import or invalid candidate path evidence.
 * @param module - Candidate source identity.
 * @param request - Accepted generation and project root.
 * @returns A lazy effect yielding the import failure with a portable stack when available.
 */
export const importFailure = Effect.fn("Discovery.frameImportFailure")(
  function* (error: unknown, module: string, request: EvaluatorRequest) {
    return FailureSchema.make({
      code: "RELKIT_EVALUATOR_IMPORT_FAILED",
      message: error instanceof Error ? error.message : String(error),
      generationId: request.generationId,
      module,
      ...(error instanceof Error && error.stack
        ? { stack: normalizeStack(error.stack, request.projectRoot) }
        : {}),
    });
  },
  (effect) =>
    observeCompiler("discovery", "importFailure", effect, () => ({ diagnostics: 1 }), false),
);

/**
 * Frames a request/root failure before candidate evaluation begins.
 * @param generationId - Accepted generation or unknown for undecodable input.
 * @param sourceMaps - Accepted source-map policy or false for undecodable input.
 * @param failure - Expected boundary diagnostic.
 * @returns A lazy effect yielding an otherwise empty failed response.
 */
export const failureResponse = Effect.fn("Discovery.frameEvaluatorFailure")(
  function* (generationId: string, sourceMaps: boolean, failure: EvaluatorFailure) {
    return yield* evaluatorResponse({ generationId, sourceMaps }, [], [failure], "", "");
  },
  (effect) =>
    observeCompiler("discovery", "failureResponse", effect, () => ({ diagnostics: 1 }), false),
);

/**
 * Removes the project root from a diagnostic stack and normalizes path separators.
 * @param stack - Native exception stack.
 * @param projectRoot - Root excluded from diagnostic paths.
 * @returns A portable stack string.
 */
function normalizeStack(stack: string, projectRoot: string): string {
  return stack.replaceAll(projectRoot.replaceAll("\\", "/"), "").replaceAll("\\", "/");
}
