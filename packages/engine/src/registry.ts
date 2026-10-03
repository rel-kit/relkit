import {
  hashGraph,
  validateGraphShape,
  type ApplicationGraph,
  type GraphCanonicalizationOptions,
} from "@relkit/graph";
import { observeExecution } from "@relkit/runtime-effect";
import { Effect } from "effect";
import { runEngineSync } from "./engine-runtime.js";
import type { InvocationTarget } from "./invoke-types.js";
import {
  collectHandlerEntries,
  compareIds,
  validateHandlers,
  validateTargets,
  versionIssues,
  type HandlerEntry,
} from "./registry-validation.js";
import type {
  FunctionHandler,
  FunctionRegistry,
  FunctionRegistryOptions,
  RegistryErrorCode,
  RegistryIssue,
  RuntimeManifestInput,
} from "./registry.types.js";
export type {
  FunctionHandler,
  FunctionRegistry,
  FunctionRegistryOptions,
  RegistryErrorCode,
  RegistryIssue,
  RuntimeHandlerEntries,
  RuntimeManifestInput,
} from "./registry.types.js";

/** Compatibility error containing stable graph/manifest verification issues. */
export class FunctionRegistryError extends Error {
  readonly code: RegistryErrorCode;
  readonly issues: readonly RegistryIssue[];

  /** Retain the stable public diagnostic fields for this compatibility error.
   * @param issues - Mutable safe diagnostics collected during verification.
   * @returns undefined
   */
  constructor(issues: readonly RegistryIssue[]) {
    const stableIssues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
    super(stableIssues.map((issue) => `${issue.code}: ${issue.message}`).join("; "));
    this.name = "FunctionRegistryError";
    this.code = stableIssues[0]?.code ?? "RELKIT_GRAPH_INVALID";
    this.issues = stableIssues;
  }
}

/** Verifies one graph/manifest pair before exposing executable handlers.
 * @returns An immutable verified registry; mismatches throw FunctionRegistryError.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export function createFunctionRegistry(options: FunctionRegistryOptions): FunctionRegistry;
/** Verify a graph/manifest cohort before exposing immutable executable handlers.
 * @returns An immutable verified registry; mismatches throw FunctionRegistryError.
 * @param graph - Application graph being verified for this generation.
 * @param manifest - Generated executable manifest paired with the graph.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export function createFunctionRegistry(
  graph: ApplicationGraph,
  manifest: RuntimeManifestInput,
  options?: GraphCanonicalizationOptions,
): FunctionRegistry;
/** Verify a graph/manifest cohort before exposing immutable executable handlers.
 * @returns An immutable verified registry; mismatches throw FunctionRegistryError.
 * @param graphOrOptions - Graph or complete graph/manifest verification configuration.
 * @param manifest - Generated executable manifest paired with the graph.
 * @param options - Explicit configuration and dependencies for this operation.
 */
export function createFunctionRegistry(
  graphOrOptions: ApplicationGraph | FunctionRegistryOptions,
  manifest?: RuntimeManifestInput,
  options: GraphCanonicalizationOptions = {},
): FunctionRegistry {
  return runEngineSync(createFunctionRegistryEffect(graphOrOptions, manifest, options));
}

/** Verify a graph/manifest cohort before exposing immutable executable handlers.
 * @param graphOrOptions - Graph or complete graph/manifest configuration.
 * @param manifest - Optional manifest paired with the graph.
 * @param options - Explicit operation configuration.
 * @returns A lazy Effect yielding the immutable registry or FunctionRegistryError diagnostics.
 */
export const createFunctionRegistryEffect = Effect.fn("Engine.createFunctionRegistry")(
  (
    graphOrOptions: ApplicationGraph | FunctionRegistryOptions,
    manifest?: RuntimeManifestInput,
    options: GraphCanonicalizationOptions = {},
  ) =>
    observeExecution(
      "engine",
      "createFunctionRegistry",
      Effect.gen(function* () {
        const input =
          manifest === undefined && isRegistryOptions(graphOrOptions)
            ? {
                graph: graphOrOptions.graph,
                manifest: graphOrOptions.manifest,
                hashOptions: graphOrOptions,
              }
            : {
                graph: graphOrOptions as ApplicationGraph,
                manifest: manifest as RuntimeManifestInput,
                hashOptions: options,
              };
        const graph = input.graph;
        const runtimeManifest = input.manifest;
        const issues = versionIssues(graph, runtimeManifest);

        let graphHash: string | undefined;
        try {
          validateGraphShape(graph, input.hashOptions.projectRoot);
          graphHash = hashGraph(graph, input.hashOptions);
        } catch (error) {
          issues.push({
            code: "RELKIT_GRAPH_INVALID",
            message: error instanceof Error ? error.message : "Graph canonicalization failed.",
          });
        }
        if (graphHash !== undefined && runtimeManifest.graphHash !== graphHash) {
          issues.push({
            code: "RELKIT_GRAPH_MANIFEST_MISMATCH",
            message: `Manifest hash ${JSON.stringify(runtimeManifest.graphHash)} does not match graph hash ${JSON.stringify(graphHash)}.`,
          });
        }
        if (issues.length > 0) return yield* Effect.fail(new FunctionRegistryError(issues));

        const functionIds = graph.nodes
          .filter((node) => node.kind === "function")
          .map((node) => node.id)
          .sort(compareIds);
        const entries = collectHandlerEntries(runtimeManifest.functions, issues);
        validateHandlers(functionIds, entries, issues);
        const targets = validateTargets(graph, runtimeManifest.targets, issues);
        if (issues.length > 0) return yield* Effect.fail(new FunctionRegistryError(issues));
        return makeRegistry(graphHash as string, entries, targets);
      }),
    ),
);

/** Compatibility alias for verified function-registry construction. */
export const createRegistry = createFunctionRegistry;

/** Freeze deterministic handler lookup while preserving Map-compatible iteration.
 * @returns A frozen deterministic registry implementing read-only Map methods.
 * @param graphHash - Verified canonical graph fingerprint.
 * @param entries - Normalized manifest or integration entries.
 * @param targets - Canonical targets keyed by stable function identity.
 */
function makeRegistry(
  graphHash: string,
  entries: readonly HandlerEntry[],
  targets: Readonly<Record<string, InvocationTarget>>,
): FunctionRegistry {
  const sorted = [...entries].sort((left, right) => compareIds(String(left.id), String(right.id)));
  const functionIds = Object.freeze(sorted.map((entry) => String(entry.id)));
  const handlers = Object.freeze(
    Object.fromEntries(sorted.map((entry) => [String(entry.id), entry.handler])),
  ) as Readonly<Record<string, FunctionHandler>>;
  const registry: FunctionRegistry = {
    graphHash,
    functionIds,
    handlers,
    targets,
    size: functionIds.length,
    get: (id) => handlers[id],
    has: (id) => Object.prototype.hasOwnProperty.call(handlers, id),
    keys: () => functionIds[Symbol.iterator](),
    values: () => functionIds.map((id) => handlers[id] as FunctionHandler)[Symbol.iterator](),
    entries: () =>
      functionIds
        .map((id) => [id, handlers[id] as FunctionHandler] as [string, FunctionHandler])
        [Symbol.iterator](),
    forEach: (callback, thisArg) => {
      for (const id of functionIds)
        callback.call(thisArg, handlers[id] as FunctionHandler, id, registry);
    },
    [Symbol.iterator]: () => registry.entries(),
  };
  return Object.freeze(registry);
}

/** Recognize the combined graph/manifest construction overload.
 * @returns Whether the native value satisfies this guard.
 * @param value - Native value being validated or projected.
 */
function isRegistryOptions(value: unknown): value is FunctionRegistryOptions {
  return isRecord(value) && "graph" in value && "manifest" in value;
}

/** Recognize non-null object records before reading native fields.
 * @returns Whether the native value satisfies this guard.
 * @param value - Native value being validated or projected.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
