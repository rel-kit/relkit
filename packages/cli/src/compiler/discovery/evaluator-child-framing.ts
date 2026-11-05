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
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { EvaluatorChildBoundaryError } from "./evaluator-child-errors.js";
import { decodeEvaluatorRequest } from "./evaluator-protocol.js";

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

/**
 * Reads the evaluator request from standard input on Bun or Node.
 * @returns The complete UTF-8 input once the parent closes the pipe.
 */
export async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Uint8Array);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Tells whether a module is the process entry point, on Node 22 releases without
 * `import.meta.main` as well.
 * @param url - The module's `import.meta.url`.
 * @returns Whether the process was started with this module.
 */
export function isMainModule(url: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && realpathSync(entry) === realpathSync(fileURLToPath(url));
}

/**
 * Builds the import URL of one candidate. Bun keys modules by path, so the generation query keeps
 * a re-import distinct; Node keys them by URL, where the query would load a second instance next
 * to the one other candidates import, so a one-shot Node child imports the plain path.
 * @param file - Absolute candidate path.
 * @param generationId - Generation identity.
 * @returns The URL to import.
 */
export function candidateUrl(file: string, generationId: string): string {
  const url = pathToFileURL(file).href;
  return typeof process.versions.bun === "string"
    ? `${url}?relkit_generation=${generationId}`
    : url;
}

/**
 * Decodes the untrusted stdin JSON request at the native transport boundary.
 * @returns A lazy effect yielding the accepted request or a typed boundary error.
 */
export const readEvaluatorRequest = Effect.fn("Discovery.readEvaluatorChildRequest")(function* () {
  const text = yield* Effect.tryPromise({
    try: readStdin,
    catch: (cause) => new EvaluatorChildBoundaryError({ operation: "read-stdin", cause }),
  });
  const value: unknown = yield* Effect.try({
    try: () => JSON.parse(text),
    catch: (cause) => new EvaluatorChildBoundaryError({ operation: "parse-request", cause }),
  });
  return yield* decodeEvaluatorRequest(value).pipe(
    Effect.mapError(
      (cause) =>
        new EvaluatorChildBoundaryError({
          operation: "decode-request",
          cause,
        }),
    ),
  );
});
