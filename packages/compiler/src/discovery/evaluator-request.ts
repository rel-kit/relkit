import { observeCompiler } from "../observability.js";
import { normalizeSourcePathEffect } from "@relkit/contracts";
import { Config, ConfigProvider, Effect, Option, Schema } from "effect";
import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { EVALUATOR_PROTOCOL, EVALUATOR_PROTOCOL_VERSION } from "./evaluator-protocol.js";
import type { EvaluatorRequest } from "./evaluator-protocol.types.js";
import type { EvaluatorOptions } from "./evaluator-request.types.js";
import { runDiscoverySync } from "./discovery-sync.js";

export type { EvaluatorOptions } from "./evaluator-request.types.js";

/** Default maximum wall time for request input, evaluation, and output. */
export const DEFAULT_EVALUATOR_TIMEOUT_MS = 10_000;

/** Child environment inherits no variables unless explicitly allowlisted. */
export const DEFAULT_ENVIRONMENT_ALLOWLIST = Object.freeze([] as string[]);

/** Caller input record; path and allowlist policies are checked during construction. */
export const EvaluatorOptionsSchema = Schema.Struct({
  projectRoot: Schema.String,
  candidates: Schema.Array(
    Schema.Union([Schema.String, Schema.Struct({ fileName: Schema.String })]),
  ),
  generationId: Schema.optional(Schema.String),
  timeoutMs: Schema.optional(Schema.Number),
  environmentAllowlist: Schema.optional(Schema.Array(Schema.String)),
  generatedDirectory: Schema.optional(Schema.String),
  networkAllowlist: Schema.optional(Schema.Array(Schema.String)),
  sourceMaps: Schema.optional(Schema.Boolean),
});

/**
 * Validates caller policy and normalizes the first occurrence of each candidate.
 * @param options - Absolute project root, candidates, and optional evaluator policy.
 * @returns A lazy effect yielding a normalized request or the original validation/path error.
 * @remarks Native realpath failures are expected; unexpected accessor and calculation defects remain defects.
 */
export const createEvaluatorRequestEffect = Effect.fn("Discovery.createEvaluatorRequest")(
  function* (options: EvaluatorOptions) {
    options = yield* Schema.decodeUnknownEffect(EvaluatorOptionsSchema)(options).pipe(
      Effect.mapError((error) => new TypeError(`Invalid evaluator options: ${error.message}`)),
    );
    if (!isAbsolute(options.projectRoot))
      return yield* Effect.fail(new TypeError("projectRoot must be absolute"));
    const projectRoot = yield* Effect.try({
      try: () => realpathSync(resolve(options.projectRoot)),
      catch: (error) => {
        if (error instanceof Error && "code" in error && typeof error.code === "string")
          return error;
        throw error;
      },
    });
    const timeoutMs = options.timeoutMs ?? DEFAULT_EVALUATOR_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1)
      return yield* Effect.fail(new TypeError("timeoutMs must be positive"));
    const generationId = options.generationId ?? crypto.randomUUID();
    if (!/^[A-Za-z0-9._-]{1,128}$/.test(generationId))
      return yield* Effect.fail(new TypeError("generationId is invalid"));
    const environmentAllowlist = [...new Set(options.environmentAllowlist ?? [])].sort();
    if (environmentAllowlist.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)))
      return yield* Effect.fail(new TypeError("environmentAllowlist contains an invalid name"));
    const networkAllowlist = [...new Set(options.networkAllowlist ?? [])].sort();
    if (networkAllowlist.some((host) => host.trim() === "" || /[\s/]/.test(host)))
      return yield* Effect.fail(new TypeError("networkAllowlist contains an invalid host"));
    const generatedDirectory = yield* normalizeSourcePathEffect(
      options.generatedDirectory ?? ".relkit/generated",
      projectRoot,
    );
    const candidates = yield* Effect.forEach(options.candidates, (candidate) =>
      normalizeCandidateEffect(candidate, projectRoot),
    );
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
    } satisfies EvaluatorRequest;
  },
  (effect, options) =>
    observeCompiler(
      "discovery",
      "createEvaluatorRequest",
      effect,
      () => ({
        files:
          options !== null && Array.isArray(options?.candidates) ? options.candidates.length : 0,
      }),
      false,
    ),
);

/**
 * Constructs a request at the synchronous compatibility boundary.
 * @param options - Project root, candidates, and evaluator policy.
 * @returns A normalized versioned request.
 * @throws TypeError for invalid policy, or the original filesystem/path error.
 */
export function createEvaluatorRequest(options: EvaluatorOptions): EvaluatorRequest {
  return runDiscoverySync(createEvaluatorRequestEffect(options));
}

/**
 * Resolves one candidate into the authoritative project-relative source identity.
 * @param candidate - A source filename or syntax-prefilter candidate.
 * @param projectRoot - Canonical absolute root constraining candidate paths.
 * @returns A lazy effect yielding a source candidate, or SourceLocationError.
 */
const normalizeCandidateEffect = Effect.fn("Discovery.normalizeCandidate")(function* (
  candidate: EvaluatorOptions["candidates"][number],
  projectRoot: string,
) {
  const file = typeof candidate === "string" ? candidate : candidate.fileName;
  return {
    file: yield* normalizeSourcePathEffect(file, projectRoot),
  } satisfies import("./evaluator-protocol.types.js").EvaluatorCandidate;
});

/**
 * Reads only allowlisted environment entries from the active configuration provider.
 * @param names - Validated environment keys permitted in the child.
 * @returns A lazy effect yielding present string entries, preserving explicit empty values.
 */
export const allowlistedEnvironmentEffect = Effect.fn("Discovery.allowlistedEnvironment")(
  function* (names: readonly string[]) {
    const entries = yield* Effect.forEach(names, (name) =>
      Config.option(Config.String(name)).pipe(
        Effect.map((value) => (Option.isSome(value) ? [[name, value.value] as const] : [])),
      ),
    );
    return Object.fromEntries(entries.flat());
  },
  (effect, names) =>
    observeCompiler(
      "discovery",
      "allowlistedEnvironment",
      effect,
      () => ({ entries: names.length }),
      false,
    ),
);

/**
 * Reads allowlisted process environment at the legacy synchronous boundary.
 * @param names - Environment keys permitted in the child.
 * @returns Present entries, including empty strings.
 */
export function allowlistedEnvironment(names: readonly string[]): Record<string, string> {
  return runDiscoverySync(
    allowlistedEnvironmentEffect(names).pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromEnvRecord(process.env, { preserveEmptyStrings: true }),
      ),
    ),
  );
}
