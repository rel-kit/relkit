import { normalizeSourcePath } from "@relkit/contracts";
import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import {
  EVALUATOR_PROTOCOL,
  EVALUATOR_PROTOCOL_VERSION,
  type EvaluatorCandidate,
  type EvaluatorRequest,
} from "./evaluator-protocol.js";

export const DEFAULT_EVALUATOR_TIMEOUT_MS = 5_000;
export const DEFAULT_ENVIRONMENT_ALLOWLIST = Object.freeze([] as string[]);

export interface EvaluatorOptions {
  readonly projectRoot: string;
  readonly candidates: readonly (string | { readonly fileName: string })[];
  readonly generationId?: string;
  readonly timeoutMs?: number;
  readonly environmentAllowlist?: readonly string[];
  readonly generatedDirectory?: string;
  readonly networkAllowlist?: readonly string[];
  readonly sourceMaps?: boolean;
}

export function createEvaluatorRequest(options: EvaluatorOptions): EvaluatorRequest {
  if (!isAbsolute(options.projectRoot)) throw new TypeError("projectRoot must be absolute");
  const projectRoot = realpathSync(resolve(options.projectRoot));
  const timeoutMs = options.timeoutMs ?? DEFAULT_EVALUATOR_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1)
    throw new TypeError("timeoutMs must be positive");
  const generationId = options.generationId ?? crypto.randomUUID();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(generationId)) throw new TypeError("generationId is invalid");
  const environmentAllowlist = [...new Set(options.environmentAllowlist ?? [])].sort();
  if (environmentAllowlist.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)))
    throw new TypeError("environmentAllowlist contains an invalid name");
  const networkAllowlist = [...new Set(options.networkAllowlist ?? [])].sort();
  if (networkAllowlist.some((host) => host.trim() === "" || /[\s/]/.test(host)))
    throw new TypeError("networkAllowlist contains an invalid host");
  const generatedDirectory = normalizeSourcePath(
    options.generatedDirectory ?? ".relkit/generated",
    projectRoot,
  );
  const candidates = options.candidates.map((candidate) => {
    const file = typeof candidate === "string" ? candidate : candidate.fileName;
    return { file: normalizeSourcePath(file, projectRoot) } satisfies EvaluatorCandidate;
  });
  return {
    protocol: EVALUATOR_PROTOCOL,
    version: EVALUATOR_PROTOCOL_VERSION,
    generationId,
    projectRoot,
    candidates: Object.freeze([
      ...new Map(candidates.map((candidate) => [candidate.file, candidate])).values(),
    ]),
    environmentAllowlist: Object.freeze(environmentAllowlist),
    generatedDirectory,
    networkAllowlist: Object.freeze(networkAllowlist),
    sourceMaps: options.sourceMaps ?? true,
    timeoutMs,
  };
}

export function allowlistedEnvironment(names: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    names.flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
}
