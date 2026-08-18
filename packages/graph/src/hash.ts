import { createHash } from "node:crypto";
import { canonicalJson, normalizeSourceLocation, type JsonValue } from "@zsys/contracts";

export const GRAPH_HASH_ALGORITHM = "sha256" as const;
export const GRAPH_HASH_PREFIX = `${GRAPH_HASH_ALGORITHM}:` as const;

export interface GraphCanonicalizationOptions {
  readonly projectRoot?: string;
}

interface GraphShape {
  readonly contractVersion: number;
  readonly appId?: string;
  readonly nodes: readonly unknown[];
  readonly edges: readonly unknown[];
}

type CanonicalContext = "graph" | "node" | "edge" | "metadata" | "data";

/** Returns a graph with portable paths, ephemeral fields removed, and sorted nodes/edges. */
export function canonicalizeGraph<T extends GraphShape>(
  graph: T,
  options: GraphCanonicalizationOptions = {},
): T {
  const normalized = canonicalizeValue(graph, options, "graph");
  if (
    !isRecord(normalized) ||
    !Array.isArray(normalized.nodes) ||
    !Array.isArray(normalized.edges)
  ) {
    throw new TypeError("A graph must contain nodes and edges arrays.");
  }
  return {
    ...normalized,
    nodes: sortJsonNodes(normalized.nodes),
    edges: sortJsonEdges(normalized.edges),
  } as T;
}

/** Serializes the canonical graph without a trailing newline. */
export function canonicalGraphJson<T extends GraphShape>(
  graph: T,
  options: GraphCanonicalizationOptions = {},
): string {
  return canonicalJson(canonicalizeGraph(graph, options));
}

/** Hashes canonical graph bytes using the single public graph hash format. */
export function hashGraph<T extends GraphShape>(
  graph: T,
  options: GraphCanonicalizationOptions = {},
): string {
  return `${GRAPH_HASH_PREFIX}${createHash(GRAPH_HASH_ALGORITHM)
    .update(canonicalGraphJson(graph, options), "utf8")
    .digest("hex")}`;
}

/** Sorts already JSON-safe graph nodes with deterministic duplicate tie-breakers. */
export function sortGraphNodes<T extends object>(
  nodes: readonly T[],
  options: GraphCanonicalizationOptions = {},
): readonly T[] {
  return sortJsonNodes(
    nodes.map((node) => canonicalizeValue(node, options, "node")),
  ) as readonly T[];
}

/** Sorts already JSON-safe graph edges with deterministic duplicate tie-breakers. */
export function sortGraphEdges<T extends object>(
  edges: readonly T[],
  options: GraphCanonicalizationOptions = {},
): readonly T[] {
  return sortJsonEdges(
    edges.map((edge) => canonicalizeValue(edge, options, "edge")),
  ) as readonly T[];
}

function canonicalizeValue(
  value: unknown,
  options: GraphCanonicalizationOptions,
  context: CanonicalContext,
): JsonValue {
  if (Array.isArray(value)) return value.map((entry) => canonicalizeValue(entry, options, context));
  if (!isRecord(value)) return value as JsonValue;
  if (!isPlainObject(value)) throw new TypeError("Graph values must be plain JSON objects.");

  const result: Record<string, JsonValue> = {};
  for (const key of Object.keys(value)) {
    if (context !== "data" && isEphemeralKey(key)) continue;
    const child = value[key];
    if (key === "source" && isSourceLocation(child)) {
      const source = normalizeSourceLocation(child, options.projectRoot);
      result[key] = { file: source.file, line: source.line, column: source.column };
    } else {
      result[key] = canonicalizeValue(child, options, childContext(context, key));
    }
  }
  return result;
}

function sortJsonNodes(nodes: readonly JsonValue[]): readonly JsonValue[] {
  return [...nodes].sort((left, right) => compareGraphValues(left, right, "node"));
}

function sortJsonEdges(edges: readonly JsonValue[]): readonly JsonValue[] {
  return [...edges].sort((left, right) => compareGraphValues(left, right, "edge"));
}

function compareGraphValues(left: JsonValue, right: JsonValue, kind: "node" | "edge"): number {
  const a = isRecord(left) ? left : {};
  const b = isRecord(right) ? right : {};
  const fields = kind === "node" ? ["kind", "id"] : ["kind", "from", "to", "role"];
  for (const field of fields) {
    const compared = compareStrings(text(a[field]), text(b[field]));
    if (compared !== 0) return compared;
  }
  return compareStrings(canonicalJson(left), canonicalJson(right));
}

function isSourceLocation(value: unknown): value is { file: string; line: number; column: number } {
  return (
    isRecord(value) &&
    typeof value.file === "string" &&
    Number.isInteger(value.line) &&
    Number.isInteger(value.column)
  );
}

function isEphemeralKey(key: string): boolean {
  const normalized = key.replaceAll("_", "").replaceAll("-", "").toLowerCase();
  return (
    normalized === "time" ||
    normalized === "timems" ||
    normalized === "timens" ||
    normalized === "timestamp" ||
    normalized === "timestamps" ||
    normalized === "createdat" ||
    normalized === "updatedat" ||
    normalized === "generatedat" ||
    normalized === "startedat" ||
    normalized === "finishedat" ||
    normalized === "completedat" ||
    normalized === "duration" ||
    normalized === "durationms" ||
    normalized === "elapsedms" ||
    normalized === "pid" ||
    normalized === "processid" ||
    normalized === "processpid" ||
    normalized === "random" ||
    normalized.startsWith("randomid") ||
    normalized.startsWith("randomseed") ||
    normalized === "nonce" ||
    normalized === "generation" ||
    normalized.startsWith("generationid") ||
    normalized.startsWith("generationtoken")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function childContext(context: CanonicalContext, key: string): CanonicalContext {
  if (key === "metadata" || key === "lifecycle" || key === "runtime") return "metadata";
  if (context === "graph" && key === "nodes") return "node";
  if (context === "graph" && key === "edges") return "edge";
  return "data";
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
