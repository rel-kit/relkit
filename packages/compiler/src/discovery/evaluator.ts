import { observeCompiler } from "../observability.js";
import { ConfigProvider, Effect } from "effect";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decodeEvaluatorFrameEffect } from "./evaluator-protocol.js";
import type { EvaluatorFailure, EvaluatorResponse } from "./evaluator-protocol.types.js";
import { createEvaluatorRequestEffect } from "./evaluator-request.js";
import type { EvaluatorOptions } from "./evaluator-request.types.js";
import { runEvaluatorProcess } from "./evaluator-process.js";
import { failedResponseEffect } from "./evaluator-response.js";

export * from "./evaluator-protocol.js";
export {
  DEFAULT_ENVIRONMENT_ALLOWLIST,
  DEFAULT_EVALUATOR_TIMEOUT_MS,
} from "./evaluator-request.js";
export type { EvaluatorOptions } from "./evaluator-request.types.js";

/**
 * Evaluates AST candidates in a short-lived child and validates its complete response.
 * @param options - Candidate files, project root, and evaluator policy.
 * @returns A lazy effect yielding accepted snapshots or framed expected diagnostics.
 * @remarks Unexpected defects and interruption remain visible. The process scope owns child reaping.
 * @example
 * ```ts
 * import { ConfigProvider, Effect } from "effect";
 * import { evaluateCandidatesEffect } from "./evaluator.js";
 * const response = await Effect.runPromise(evaluateCandidatesEffect({
 *   projectRoot: process.cwd(), candidates: [],
 * }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromEnvRecord({}))));
 * ```
 */
export const evaluateCandidatesEffect = Effect.fn("Discovery.evaluateCandidates")(
  function* (options: EvaluatorOptions): Effect.fn.Return<EvaluatorResponse> {
    const requestResult = yield* createEvaluatorRequestEffect(options).pipe(Effect.result);
    if (requestResult._tag === "Failure") {
      const generationId =
        typeof options?.generationId === "string" ? options.generationId : "unknown";
      const sourceMaps = typeof options?.sourceMaps === "boolean" ? options.sourceMaps : true;
      return yield* failedResponseEffect(generationId, sourceMaps, {
        code: "RELKIT_EVALUATOR_REQUEST_INVALID",
        message: errorMessage(requestResult.failure),
        generationId,
      });
    }
    const request = requestResult.success;
    const childPath = yield* evaluatorChildPathEffect();
    const process = yield* runEvaluatorProcess(request, childPath).pipe(Effect.result);
    if (process._tag === "Failure") {
      return yield* failedResponseEffect(request.generationId, request.sourceMaps, {
        code: "RELKIT_EVALUATOR_PROCESS_FAILED",
        message: errorMessage(process.failure.cause),
        generationId: request.generationId,
      });
    }
    const { stdout, stderr, exitCode, timedOut } = process.success;
    const framed = yield* decodeEvaluatorFrameEffect(stdout);
    if (framed === undefined) {
      return yield* failedResponseEffect(
        request.generationId,
        request.sourceMaps,
        {
          code: timedOut ? "RELKIT_EVALUATOR_TIMEOUT" : "RELKIT_EVALUATOR_PROTOCOL_INVALID",
          message: timedOut
            ? `Evaluator exceeded ${request.timeoutMs}ms and was killed.`
            : "Evaluator exited without a valid versioned response frame.",
          generationId: request.generationId,
          exitCode,
          timedOut,
          stdout,
          stderr,
        },
        stdout,
        stderr,
      );
    }
    const response = {
      ...framed.response,
      stdout: joinOutput(framed.response.stdout, framed.stdout),
      stderr: joinOutput(framed.response.stderr, stderr),
    };
    if (
      response.generationId !== request.generationId ||
      (exitCode !== 0 && response.status === "ok")
    ) {
      return yield* failedResponseEffect(
        request.generationId,
        request.sourceMaps,
        {
          code: "RELKIT_EVALUATOR_PROTOCOL_INVALID",
          message: "Evaluator response identity or exit status was invalid.",
          generationId: request.generationId,
          exitCode,
          stdout: response.stdout,
          stderr: response.stderr,
        },
        response.stdout,
        response.stderr,
      );
    }
    return {
      ...response,
      failures: response.failures.map((entry): EvaluatorFailure => ({
        ...entry,
        ...(response.stdout === "" ? {} : { stdout: response.stdout }),
        ...(response.stderr === "" ? {} : { stderr: response.stderr }),
      })),
    };
  },
  (effect, options) =>
    observeCompiler(
      "discovery",
      "evaluateCandidates",
      effect,
      () => ({ files: Array.isArray(options?.candidates) ? options.candidates.length : 0 }),
      true,
    ),
);

/**
 * Runs candidate evaluation at the public Promise boundary using the host environment.
 * @param options - Candidate files and evaluator policy.
 * @returns A Promise for accepted snapshots or structured expected failures.
 */
export function evaluateCandidates(options: EvaluatorOptions): Promise<EvaluatorResponse> {
  return Effect.runPromise(
    evaluateCandidatesEffect(options).pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromEnvRecord(process.env, { preserveEmptyStrings: true }),
      ),
    ),
  );
}

/**
 * Concatenates framed and raw output without introducing separators.
 * @param protocolOutput - Output captured by candidate hooks.
 * @param rawOutput - Output observed outside the valid frame.
 * @returns Their ordered concatenation.
 */
function joinOutput(protocolOutput: string, rawOutput: string): string {
  return protocolOutput === ""
    ? rawOutput
    : rawOutput === ""
      ? protocolOutput
      : `${protocolOutput}${rawOutput}`;
}

/**
 * Formats a native expected failure for wire diagnostics.
 * @param error - Native or typed request/transport failure.
 * @returns Its message, retaining non-Error rejection values.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Chooses the built evaluator entrypoint or its source-development fallback.
 * @returns A lazy effect yielding the entrypoint's absolute file path.
 */
const evaluatorChildPathEffect = Effect.fn("Discovery.evaluatorChildPath")(function* () {
  const compiledPath = fileURLToPath(new URL("./evaluator-child.js", import.meta.url));
  return existsSync(compiledPath)
    ? compiledPath
    : fileURLToPath(new URL("./evaluator-child.ts", import.meta.url));
});
