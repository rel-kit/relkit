import { canonicalJson } from "@relkit/contracts";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  EVALUATOR_DETECTOR_COVERAGE,
  EVALUATOR_PROTOCOL,
  EVALUATOR_PROTOCOL_VERSION,
  type EvaluatorFailure,
  type EvaluatorRequest,
  type EvaluatorResponse,
  decodeEvaluatorFrame,
} from "./evaluator-protocol.js";
import {
  allowlistedEnvironment,
  createEvaluatorRequest,
  type EvaluatorOptions,
} from "./evaluator-request.js";

export * from "./evaluator-protocol.js";
export {
  DEFAULT_ENVIRONMENT_ALLOWLIST,
  DEFAULT_EVALUATOR_TIMEOUT_MS,
} from "./evaluator-request.js";
export type { EvaluatorOptions } from "./evaluator-request.js";

/** Evaluates only AST-prefilter candidates in a short-lived Bun child process. */
export async function evaluateCandidates(options: EvaluatorOptions): Promise<EvaluatorResponse> {
  let request: EvaluatorRequest;
  const generationId = options.generationId ?? crypto.randomUUID();
  try {
    request = createEvaluatorRequest({
      ...options,
      generationId,
      candidates: options.candidates,
    });
  } catch (error) {
    return failedResponse(
      options.generationId ?? "unknown",
      options.sourceMaps ?? true,
      failure("RELKIT_EVALUATOR_REQUEST_INVALID", errorMessage(error), options.generationId),
    );
  }
  const childPath = evaluatorChildPath();
  let child: Bun.Subprocess<"pipe", "pipe", "pipe">;
  try {
    child = Bun.spawn(
      [process.execPath, "run", "--no-env-file", "--no-install", "--silent", childPath],
      {
        cwd: request.projectRoot,
        env: allowlistedEnvironment(request.environmentAllowlist),
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
  } catch (error) {
    return failedResponse(
      request.generationId,
      request.sourceMaps,
      failure("RELKIT_EVALUATOR_PROCESS_FAILED", errorMessage(error), request.generationId),
    );
  }
  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  await child.stdin.write(canonicalJson(request));
  child.stdin.end();
  const exit = child.exited.then((exitCode) => ({ kind: "exit" as const, exitCode }));
  let timer!: ReturnType<typeof setTimeout>;
  const timeout = new Promise<{ readonly kind: "timeout" }>((resolveTimeout) => {
    timer = setTimeout(() => resolveTimeout({ kind: "timeout" }), request.timeoutMs);
  });
  const outcome = await Promise.race([exit, timeout]);
  clearTimeout(timer);
  if (outcome.kind === "timeout") child.kill();
  const exitCode = outcome.kind === "exit" ? outcome.exitCode : await child.exited;
  const [rawStdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  const framed = decodeEvaluatorFrame(rawStdout);
  if (framed === undefined) {
    return failedResponse(
      request.generationId,
      request.sourceMaps,
      failure(
        outcome.kind === "timeout"
          ? "RELKIT_EVALUATOR_TIMEOUT"
          : "RELKIT_EVALUATOR_PROTOCOL_INVALID",
        outcome.kind === "timeout"
          ? `Evaluator exceeded ${request.timeoutMs}ms and was killed.`
          : "Evaluator exited without a valid versioned response frame.",
        request.generationId,
        { exitCode, timedOut: outcome.kind === "timeout", stdout: rawStdout, stderr },
      ),
      rawStdout,
      stderr,
    );
  }
  const response = {
    ...framed.response,
    stdout: joinOutput(framed.response.stdout, framed.stdout),
    stderr: joinOutput(framed.response.stderr, stderr),
  } satisfies EvaluatorResponse;
  if (
    response.generationId !== request.generationId ||
    (exitCode !== 0 && response.status === "ok")
  ) {
    return failedResponse(
      request.generationId,
      request.sourceMaps,
      failure(
        "RELKIT_EVALUATOR_PROTOCOL_INVALID",
        "Evaluator response identity or exit status was invalid.",
        request.generationId,
        {
          exitCode,
          stdout: response.stdout,
          stderr: response.stderr,
        },
      ),
      response.stdout,
      response.stderr,
    );
  }
  return {
    ...response,
    failures: response.failures.map((entry) => ({
      ...entry,
      ...(response.stdout === "" ? {} : { stdout: response.stdout }),
      ...(response.stderr === "" ? {} : { stderr: response.stderr }),
    })),
  };
}

function joinOutput(protocolOutput: string, rawOutput: string): string {
  return protocolOutput === ""
    ? rawOutput
    : rawOutput === ""
      ? protocolOutput
      : `${protocolOutput}${rawOutput}`;
}

function failedResponse(
  generationId: string,
  sourceMaps: boolean,
  entry: EvaluatorFailure,
  stdout = "",
  stderr = "",
): EvaluatorResponse {
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
  };
}
function failure(
  code: EvaluatorFailure["code"],
  message: string,
  generationId = "unknown",
  details: Pick<EvaluatorFailure, "exitCode" | "timedOut" | "stdout" | "stderr"> = {},
): EvaluatorFailure {
  return { code, message, generationId, ...details };
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function evaluatorChildPath(): string {
  const compiledPath = fileURLToPath(new URL("./evaluator-child.js", import.meta.url));
  return existsSync(compiledPath)
    ? compiledPath
    : fileURLToPath(new URL("./evaluator-child.ts", import.meta.url));
}
