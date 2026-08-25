import { GENERATOR_VERSION, MANIFEST_VERSION, type MaybePromise } from "@zsys/contracts";
import {
  hashGraph,
  validateGraphShape,
  type ApplicationGraph,
  type GraphCanonicalizationOptions,
} from "@zsys/graph";
import {
  collectHandlerEntries,
  compareIds,
  validateHandlers,
  versionIssues,
  type HandlerEntry,
} from "./registry-validation.js";

export type FunctionHandler = (...arguments_: readonly unknown[]) => MaybePromise<unknown>;

export type RuntimeHandlerEntries =
  | Readonly<Record<string, FunctionHandler>>
  | ReadonlyMap<string, FunctionHandler>
  | readonly (readonly [string, FunctionHandler])[];

export interface RuntimeManifestInput {
  readonly contractVersion: typeof MANIFEST_VERSION;
  readonly generatorVersion: typeof GENERATOR_VERSION;
  readonly graphHash: string;
  readonly functions: RuntimeHandlerEntries;
}

export interface FunctionRegistryOptions extends GraphCanonicalizationOptions {
  readonly graph: ApplicationGraph;
  readonly manifest: RuntimeManifestInput;
}

export type RegistryErrorCode =
  | "ZSYS_GRAPH_INVALID"
  | "ZSYS_GRAPH_VERSION_UNSUPPORTED"
  | "ZSYS_MANIFEST_VERSION_UNSUPPORTED"
  | "ZSYS_MANIFEST_GENERATOR_UNSUPPORTED"
  | "ZSYS_GRAPH_MANIFEST_MISMATCH"
  | "ZSYS_GRAPH_FUNCTION_DUPLICATE"
  | "ZSYS_MANIFEST_HANDLER_MISSING"
  | "ZSYS_MANIFEST_HANDLER_EXTRA"
  | "ZSYS_MANIFEST_HANDLER_DUPLICATE"
  | "ZSYS_MANIFEST_HANDLER_INVALID";

export interface RegistryIssue {
  readonly code: RegistryErrorCode;
  readonly message: string;
  readonly functionId?: string;
}

export class FunctionRegistryError extends Error {
  readonly code: RegistryErrorCode;
  readonly issues: readonly RegistryIssue[];

  constructor(issues: readonly RegistryIssue[]) {
    const stableIssues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })));
    super(stableIssues.map((issue) => `${issue.code}: ${issue.message}`).join("; "));
    this.name = "FunctionRegistryError";
    this.code = stableIssues[0]?.code ?? "ZSYS_GRAPH_INVALID";
    this.issues = stableIssues;
  }
}

export interface FunctionRegistry extends ReadonlyMap<string, FunctionHandler> {
  readonly graphHash: string;
  readonly functionIds: readonly string[];
  readonly handlers: Readonly<Record<string, FunctionHandler>>;
}

/** Verifies one graph/manifest pair before exposing executable handlers. */
export function createFunctionRegistry(options: FunctionRegistryOptions): FunctionRegistry;
export function createFunctionRegistry(
  graph: ApplicationGraph,
  manifest: RuntimeManifestInput,
  options?: GraphCanonicalizationOptions,
): FunctionRegistry;
export function createFunctionRegistry(
  graphOrOptions: ApplicationGraph | FunctionRegistryOptions,
  manifest?: RuntimeManifestInput,
  options: GraphCanonicalizationOptions = {},
): FunctionRegistry {
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
      code: "ZSYS_GRAPH_INVALID",
      message: error instanceof Error ? error.message : "Graph canonicalization failed.",
    });
  }
  if (graphHash !== undefined && runtimeManifest.graphHash !== graphHash) {
    issues.push({
      code: "ZSYS_GRAPH_MANIFEST_MISMATCH",
      message: `Manifest hash ${JSON.stringify(runtimeManifest.graphHash)} does not match graph hash ${JSON.stringify(graphHash)}.`,
    });
  }
  if (issues.length > 0) throw new FunctionRegistryError(issues);

  const functionIds = graph.nodes
    .filter((node) => node.kind === "function")
    .map((node) => node.id)
    .sort(compareIds);
  const entries = collectHandlerEntries(runtimeManifest.functions, issues);
  validateHandlers(functionIds, entries, issues);
  if (issues.length > 0) throw new FunctionRegistryError(issues);
  return makeRegistry(graphHash as string, entries);
}

export const createRegistry = createFunctionRegistry;

function makeRegistry(graphHash: string, entries: readonly HandlerEntry[]): FunctionRegistry {
  const sorted = [...entries].sort((left, right) => compareIds(String(left.id), String(right.id)));
  const functionIds = Object.freeze(sorted.map((entry) => String(entry.id)));
  const handlers = Object.freeze(
    Object.fromEntries(sorted.map((entry) => [String(entry.id), entry.handler])),
  ) as Readonly<Record<string, FunctionHandler>>;
  const registry: FunctionRegistry = {
    graphHash,
    functionIds,
    handlers,
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

function isRegistryOptions(value: unknown): value is FunctionRegistryOptions {
  return isRecord(value) && "graph" in value && "manifest" in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
