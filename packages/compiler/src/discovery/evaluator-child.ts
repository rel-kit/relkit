import { normalizeSourcePath } from "@zsys/contracts";
import {
  EVALUATOR_DETECTOR_COVERAGE,
  EVALUATOR_PROTOCOL,
  EVALUATOR_PROTOCOL_VERSION,
  type EvaluatorCandidate,
  type EvaluatorFailure,
  type EvaluatorModuleResult,
  type EvaluatorRequest,
  type EvaluatorResponse,
  encodeEvaluatorFrame,
  isEvaluatorRequest,
} from "./evaluator-protocol.js";
import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
import { installEvaluatorDetectors } from "./evaluator-detectors.js";
import { sideEffectFailure, snapshotModule } from "./evaluator-child-utils.js";

if (import.meta.main) {
  const response = await evaluateFromStdin();
  process.stdout.write(encodeEvaluatorFrame(response));
  process.exitCode = response.status === "ok" ? 0 : 1;
}

async function evaluateFromStdin(): Promise<EvaluatorResponse> {
  let value: unknown;
  try {
    value = JSON.parse(await new Response(Bun.stdin).text());
  } catch (error) {
    return failureResponse("unknown", false, requestFailure(error));
  }
  if (!isEvaluatorRequest(value)) {
    return failureResponse("unknown", false, {
      code: "ZSYS_EVALUATOR_REQUEST_INVALID",
      message: "Evaluator request does not match the supported protocol.",
      generationId: "unknown",
    });
  }
  const request = value;
  if (realpathSync(resolve(process.cwd())) !== realpathSync(resolve(request.projectRoot))) {
    return failureResponse(request.generationId, request.sourceMaps, {
      code: "ZSYS_EVALUATOR_ROOT_INVALID",
      message: "Evaluator working directory does not match the requested project root.",
      generationId: request.generationId,
    });
  }
  return evaluateCandidates(request);
}

async function evaluateCandidates(request: EvaluatorRequest): Promise<EvaluatorResponse> {
  const modules: EvaluatorModuleResult[] = [];
  const failures: EvaluatorFailure[] = [];
  let stdout = "";
  let stderr = "";
  for (const candidate of request.candidates) {
    const result = await evaluateCandidate(candidate, request);
    stdout += result.stdout;
    stderr += result.stderr;
    if (result.failure !== undefined) failures.push(result.failure);
    else if (result.module !== undefined) modules.push(result.module);
  }
  return response(request, modules, failures, stdout, stderr);
}

interface CandidateResult {
  readonly module: EvaluatorModuleResult | undefined;
  readonly failure: EvaluatorFailure | undefined;
  readonly stdout: string;
  readonly stderr: string;
}

async function evaluateCandidate(
  candidate: EvaluatorCandidate,
  request: EvaluatorRequest,
): Promise<CandidateResult> {
  const file = normalizeCandidate(candidate.file, request.projectRoot);
  const detector = installEvaluatorDetectors({
    projectRoot: request.projectRoot,
    generatedDirectory: resolve(request.projectRoot, request.generatedDirectory),
    networkAllowlist: request.networkAllowlist,
  });
  try {
    let module: Record<string, unknown>;
    try {
      module = (await import(
        `${pathToFileURL(file).href}?zsys_generation=${request.generationId}`
      )) as Record<string, unknown>;
    } catch (error) {
      const report = detector.finish();
      return {
        module: undefined,
        failure:
          report.sideEffects.length > 0
            ? sideEffectFailure(report.sideEffects, candidate.file, request)
            : importFailure(error, candidate.file, request),
        stdout: report.stdout,
        stderr: report.stderr,
      };
    }
    const report = detector.finish();
    if (report.sideEffects.length > 0) {
      return {
        module: undefined,
        failure: sideEffectFailure(report.sideEffects, candidate.file, request),
        stdout: report.stdout,
        stderr: report.stderr,
      };
    }
    return { module: snapshotModule(module, candidate, request), failure: undefined, ...report };
  } finally {
    detector.restore();
  }
}

function normalizeCandidate(file: string, projectRoot: string): string {
  const relativeFile = normalizeSourcePath(file, projectRoot);
  const absolute = resolve(projectRoot, relativeFile);
  const outside = relative(projectRoot, absolute);
  if (outside.startsWith("..") || outside.includes("/../")) {
    throw new Error("Candidate file must remain inside the project root.");
  }
  return absolute;
}

function importFailure(
  error: unknown,
  module: string,
  request: EvaluatorRequest,
): EvaluatorFailure {
  return {
    code: "ZSYS_EVALUATOR_IMPORT_FAILED",
    message: error instanceof Error ? error.message : String(error),
    generationId: request.generationId,
    module,
    ...(error instanceof Error && error.stack
      ? { stack: normalizeStack(error.stack, request.projectRoot) }
      : {}),
  };
}

function requestFailure(error: unknown): EvaluatorFailure {
  return {
    code: "ZSYS_EVALUATOR_REQUEST_INVALID",
    message: error instanceof Error ? error.message : String(error),
    generationId: "unknown",
  };
}

function normalizeStack(stack: string, projectRoot: string): string {
  return stack.replaceAll(projectRoot.replaceAll("\\", "/"), "").replaceAll("\\", "/");
}

function failureResponse(
  generationId: string,
  sourceMaps: boolean,
  failure: EvaluatorFailure,
): EvaluatorResponse {
  return response({ generationId, sourceMaps }, [], [failure], "", "");
}

function response(
  request: Pick<EvaluatorRequest, "generationId" | "sourceMaps">,
  modules: readonly EvaluatorModuleResult[],
  failures: readonly EvaluatorFailure[],
  stdout: string,
  stderr: string,
): EvaluatorResponse {
  return {
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
  };
}
