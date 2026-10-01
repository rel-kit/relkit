import { observeCompiler } from "../observability.js";
import { normalizeSourcePathEffect } from "@relkit/contracts";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Effect, Result } from "effect";
import { acquireEvaluatorDetectors } from "./evaluator-detectors.js";
import { sideEffectFailureEffect, snapshotModuleEffect } from "./evaluator-child-utils.js";
import { EvaluatorChildBoundaryError } from "./evaluator-child-errors.js";
import { evaluatorResponse, failureResponse, importFailure } from "./evaluator-child-framing.js";
import { decodeEvaluatorRequest, encodeEvaluatorFrame } from "./evaluator-protocol.js";
import { CandidateResultSchema, EvaluatorFailure } from "./evaluator-protocol-schema.js";
import type {
  EvaluatorCandidate,
  EvaluatorFailure as Failure,
  EvaluatorModuleResult as Module,
  EvaluatorRequest,
} from "./evaluator-protocol.types.js";

export { CandidateResultSchema } from "./evaluator-protocol-schema.js";
export type { CandidateResult } from "./evaluator-child.types.js";

/**
 * Reads and validates the native child request before importing candidate modules.
 * @returns A lazy effect yielding a response, with expected request/root failures framed.
 * @remarks Native adapters classify expected failures; defects and interruption remain visible.
 */
const evaluateFromStdin = Effect.fn("Discovery.evaluateFromStdin")(function* () {
  const decoded = yield* readRequest().pipe(Effect.result);
  if (Result.isFailure(decoded)) {
    return yield* failureResponse(
      "unknown",
      false,
      EvaluatorFailure.make({
        code: "RELKIT_EVALUATOR_REQUEST_INVALID",
        message: decoded.failure.message,
        generationId: "unknown",
      }),
    );
  }
  const request = decoded.success;
  const root = yield* validateRoot(request).pipe(Effect.result);
  if (Result.isFailure(root)) {
    return yield* failureResponse(
      request.generationId,
      request.sourceMaps,
      EvaluatorFailure.make({
        code: "RELKIT_EVALUATOR_ROOT_INVALID",
        message: "Evaluator working directory does not match the requested project root.",
        generationId: request.generationId,
      }),
    );
  }
  return yield* evaluateCandidates(request);
});

/**
 * Decodes the untrusted stdin JSON request at the native transport boundary.
 * @returns A lazy effect yielding the accepted request or a typed boundary error.
 */
const readRequest = Effect.fn("Discovery.readEvaluatorChildRequest")(function* () {
  const text = yield* Effect.tryPromise({
    try: () => new Response(Bun.stdin).text(),
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

/**
 * Confirms the process and request identify the same real project root.
 * @param request - Decoded evaluator request.
 * @returns A lazy effect that succeeds only when roots match, with typed native/root failures.
 */
const validateRoot = Effect.fn("Discovery.validateEvaluatorChildRoot")(function* (
  request: EvaluatorRequest,
) {
  const roots = yield* Effect.try({
    try: () => [realpathSync(resolve(process.cwd())), realpathSync(resolve(request.projectRoot))],
    catch: (cause) => new EvaluatorChildBoundaryError({ operation: "resolve-root", cause }),
  });
  if (roots[0] !== roots[1])
    return yield* Effect.fail(
      new EvaluatorChildBoundaryError({
        operation: "validate-root",
        cause: new Error("Evaluator root mismatch."),
      }),
    );
});

/**
 * Evaluates candidates sequentially because native hooks belong to the entire child process.
 * @param request - Decoded evaluator configuration and ordered candidates.
 * @returns A lazy effect yielding ordered results and captured output.
 * @remarks No retries occur: module evaluation is not idempotent, and import cannot be cancelled.
 */
export const evaluateCandidates = Effect.fn("Discovery.evaluateCandidates")(
  function* (request: EvaluatorRequest) {
    const results = yield* Effect.forEach(request.candidates, (candidate) =>
      evaluateCandidate(candidate, request),
    );
    const modules: Module[] = [];
    const failures: Failure[] = [];
    let stdout = "";
    let stderr = "";
    for (const result of results) {
      stdout += result.stdout;
      stderr += result.stderr;
      if (result.failure !== undefined) failures.push(result.failure);
      else if (result.module !== undefined) modules.push(result.module);
    }
    return yield* evaluatorResponse(request, modules, failures, stdout, stderr);
  },
  (effect, request) =>
    observeCompiler(
      "discovery",
      "evaluateCandidates",
      effect,
      () => ({
        files: request.candidates.length,
      }),
      false,
    ),
);

/**
 * Imports one candidate under scoped native hooks and snapshots accepted descriptors.
 * @param candidate - Source candidate within the requested project root.
 * @param request - Accepted evaluator configuration and generation.
 * @returns A lazy effect yielding success or an expected framed candidate failure.
 * @remarks Escaped paths fail before acquiring hooks. Import rejections are expected native
 * boundary failures; snapshot defects, acquisition defects and interruption remain visible.
 */
export const evaluateCandidate = Effect.fn("Discovery.evaluateCandidate")(
  function* (candidate: EvaluatorCandidate, request: EvaluatorRequest) {
    const normalized = yield* normalizeCandidate(candidate.file, request.projectRoot).pipe(
      Effect.result,
    );
    if (Result.isFailure(normalized)) {
      return CandidateResultSchema.make({
        module: undefined,
        failure: yield* importFailure(normalized.failure.cause, candidate.file, request),
        stdout: "",
        stderr: "",
      });
    }
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const detector = yield* acquireEvaluatorDetectors({
          projectRoot: request.projectRoot,
          generatedDirectory: resolve(request.projectRoot, request.generatedDirectory),
          networkAllowlist: request.networkAllowlist,
        });
        const imported = yield* importCandidate(normalized.success, request.generationId).pipe(
          Effect.result,
        );
        const report = yield* detector.finishEffect();
        if (report.sideEffects.length > 0) {
          return CandidateResultSchema.make({
            module: undefined,
            failure: yield* sideEffectFailureEffect(report.sideEffects, candidate.file, request),
            stdout: report.stdout,
            stderr: report.stderr,
          });
        }
        if (Result.isFailure(imported)) {
          return CandidateResultSchema.make({
            module: undefined,
            failure: yield* importFailure(imported.failure.cause, candidate.file, request),
            stdout: report.stdout,
            stderr: report.stderr,
          });
        }
        return CandidateResultSchema.make({
          module: yield* snapshotModuleEffect(imported.success, candidate, request),
          failure: undefined,
          stdout: report.stdout,
          stderr: report.stderr,
        });
      }),
    );
  },
  (effect) =>
    observeCompiler("discovery", "evaluateCandidate", effect, () => ({ files: 1 }), false),
);

/**
 * Resolves a candidate through the existing typed portable-path contract.
 * @param file - Candidate path to normalize.
 * @param projectRoot - Absolute root owning all candidates.
 * @returns A lazy effect yielding an absolute in-root path or a typed boundary failure.
 */
const normalizeCandidate = Effect.fn("Discovery.normalizeEvaluatorCandidate")(function* (
  file: string,
  projectRoot: string,
) {
  const normalized = yield* normalizeSourcePathEffect(file, projectRoot).pipe(
    Effect.mapError(
      (cause) => new EvaluatorChildBoundaryError({ operation: "normalize-candidate", cause }),
    ),
  );
  const absolute = resolve(projectRoot, normalized);
  const outside = relative(projectRoot, absolute);
  if (outside === ".." || outside.startsWith("../") || isAbsolute(outside)) {
    return yield* Effect.fail(
      new EvaluatorChildBoundaryError({
        operation: "normalize-candidate",
        cause: new Error("Candidate file must remain inside the project root."),
      }),
    );
  }
  return absolute;
});

/**
 * Adapts the native module loader's unknown rejection channel.
 * @param file - Absolute normalized candidate path.
 * @param generationId - Cache-busting generation identity supplied by the request.
 * @returns A lazy effect yielding the native namespace or a typed loader rejection.
 * @remarks Native imports cannot abort; parent deadlines terminate the child. Interruption remains interruption.
 */
const importCandidate = Effect.fn("Discovery.importEvaluatorCandidate")(function* (
  file: string,
  generationId: string,
) {
  return yield* Effect.tryPromise({
    try: () =>
      import(`${pathToFileURL(file).href}?relkit_generation=${generationId}`) as Promise<
        Record<string, unknown>
      >,
    catch: (cause) => new EvaluatorChildBoundaryError({ operation: "import-candidate", cause }),
  });
});
if (import.meta.main) {
  // This process entrypoint is the sole asynchronous runtime/transport boundary.
  const response = await Effect.runPromise(evaluateFromStdin());
  process.stdout.write(encodeEvaluatorFrame(response));
  process.exitCode = response.status === "ok" ? 0 : 1;
}
