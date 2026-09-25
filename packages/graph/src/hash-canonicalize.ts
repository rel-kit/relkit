import { canonicalJson, normalizeSourceLocation, type JsonValue } from "@relkit/contracts";
import { GraphCanonicalizationError } from "./hash-errors.js";
import type { CanonicalContext } from "./hash-canonicalize.types.js";
import type { GraphCanonicalizationOptions } from "./hash.types.js";
/**
 * Canonicalizes a graph value while stripping ephemeral graph metadata.
 * @param value - Candidate graph value.
 * @param options - Optional project root for source paths.
 * @param context - Whether this value is graph structure, metadata, or user data.
 * @returns A portable JSON value; invalid source locations or non-plain objects throw.
 * @example canonicalizeValue({ id: "orders" }, {}, "node");
 */
export function canonicalizeValue(
  value: unknown,
  options: GraphCanonicalizationOptions,
  context: CanonicalContext,
): JsonValue {
  if (Array.isArray(value)) return value.map((entry) => canonicalizeValue(entry, options, context));
  if (!isRecord(value)) return value as JsonValue;
  if (!isPlainObject(value))
    throw new GraphCanonicalizationError({ message: "Graph values must be plain JSON objects." });
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
/**
 * Sorts canonical node values with deterministic duplicate tie breaks.
 * @param nodes - Canonical node values.
 * @returns A newly sorted array; serialization defects propagate.
 * @example sortJsonNodes([{ kind: "app", id: "orders" }]);
 */
export function sortJsonNodes(nodes: readonly JsonValue[]): readonly JsonValue[] {
  return [...nodes].sort((left, right) => compareGraphValues(left, right, "node"));
}
/**
 * Sorts canonical edge values, preserving ordered service declarations.
 * @param edges - Canonical edge values.
 * @returns A newly sorted array; serialization defects propagate.
 * @example sortJsonEdges([{ kind: "calls-function", from: "a", to: "b" }]);
 */
export function sortJsonEdges(edges: readonly JsonValue[]): readonly JsonValue[] {
  return [...edges].sort((left, right) => compareGraphValues(left, right, "edge"));
}
function compareGraphValues(left: JsonValue, right: JsonValue, kind: "node" | "edge"): number {
  const a = isRecord(left) ? left : {};
  const b = isRecord(right) ? right : {};
  if (kind === "edge" && isOrderedServiceEdge(a) && isOrderedServiceEdge(b)) {
    const order = numberValue(a.order) - numberValue(b.order);
    if (order !== 0) return order;
  }
  const fields = kind === "node" ? ["kind", "id"] : ["kind", "from", "to", "role"];
  for (const field of fields) {
    const compared = compareStrings(text(a[field]), text(b[field]));
    if (compared !== 0) return compared;
  }
  return compareStrings(canonicalJson(left), canonicalJson(right));
}
function isOrderedServiceEdge(value: Record<string, JsonValue>): boolean {
  return ["exposes-function", "exposes-event", "exposes-task", "exposes-job"].includes(
    String(value.kind),
  );
}
function numberValue(value: JsonValue | undefined): number {
  return typeof value === "number" ? value : Number.MAX_SAFE_INTEGER;
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
