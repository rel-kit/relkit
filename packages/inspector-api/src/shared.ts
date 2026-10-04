import type { InspectorValueSource, ResolvedActiveGeneration, Page } from "./shared.types.js";
export type {
  InspectorMode,
  InspectorValueSource,
  InspectorRuntimeServices,
  InspectorGenerationServices,
  InspectorActiveGeneration,
  InspectorActiveGenerationSource,
  ActiveGenerationOptions,
  ResolvedActiveGeneration,
  Page,
} from "./shared.types.js";
import {
  API_VERSION,
  normalizeSourceLocation,
  type JsonValue,
  type MaybePromise,
} from "@relkit/contracts";
import { redactRecord, type RedactionPolicy } from "@relkit/observability";

/** Existing TypeError query-validation contract retained at synchronous compatibility edges. */
export class InspectorQueryError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "InspectorQueryError";
  }
}

/**
 * Checks the existing non-null non-array record boundary.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Whether the value can be selectively projected as a record.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Accepts nonempty stored identity strings.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns The stored identity string or undefined.
 */
export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Resolves the supported native value-or-thunk boundary once.
 * @typeParam T - Successful public or native value retained by this boundary.
 * @param source - Native or stored source whose public value is resolved selectively.
 * @returns The native result without deep traversal.
 */
export async function resolveValue<T>(
  source: InspectorValueSource<T> | undefined,
): Promise<T | undefined> {
  return source === undefined
    ? undefined
    : typeof source === "function"
      ? await (source as () => MaybePromise<T>)()
      : source;
}

/**
 * Resolves a declared generation service using existing precedence.
 * @param source - Native or stored source whose public value is resolved selectively.
 * @returns The native selected service value.
 */
export async function resolveService(source: unknown): Promise<unknown> {
  const value = await resolveValue(source);
  if (isRecord(value) && typeof value.snapshot === "function") return await value.snapshot();
  return value;
}

/**
 * Filters and paginates public records under the existing bounded query contract.
 * @typeParam T - Successful public or native value retained by this boundary.
 * @param items - Ordered public records to filter and paginate.
 * @param request - HTTP request carrying bounded filters, negotiated headers and a native cancellation signal.
 * @returns An ordered page and continuation cursor when required.
 */
export function page<T extends JsonValue>(items: readonly T[], request: Request): Page<T> {
  const params = new URL(request.url).searchParams;
  const search = readFilter(params.get("search"), "search");
  const kind = readFilter(params.get("kind"), "kind");
  const status = readFilter(params.get("status"), "status");
  const domain = readFilter(params.get("domain"), "domain");
  const layer = readFilter(params.get("layer"), "layer");
  const filtered = items.filter(
    (item) =>
      (search === undefined || includesText(item, search.toLowerCase())) &&
      (kind === undefined || matchesField(item, ["kind", "type", "method"], kind)) &&
      (status === undefined || matchesField(item, ["status", "state", "outcome"], status)) &&
      (domain === undefined || matchesField(item, ["domainId"], domain)) &&
      (layer === undefined || matchesField(item, ["kind", "triggerType"], layer)),
  );
  const cursor = readInteger(params.get("cursor"), "cursor", 0);
  const limit = Math.min(readInteger(params.get("limit"), "limit", 50), 100);
  const selected = filtered.slice(cursor, cursor + limit);
  const next = cursor + selected.length;
  return next < filtered.length
    ? { items: selected, nextCursor: String(next) }
    : { items: selected };
}

/**
 * Normalizes a bounded public query selector.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param name - Public field or route parameter name.
 * @returns Accepted selector text or undefined.
 */
function readFilter(value: string | null, name: string): string | undefined {
  if (value === null || value.trim() === "") return undefined;
  if (value.length > 128) throw new InspectorQueryError(`${name} is invalid`);
  return value.trim();
}

/**
 * Matches a public record using the existing declared field aliases.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param names - Declared public field names checked for the existing filter aliases.
 * @param expected - Expected generation, graph and filters bound into the cursor.
 * @returns Whether the projected field matches the filter.
 */
function matchesField(value: JsonValue, names: readonly string[], expected: string): boolean {
  if (!isRecord(value)) return false;
  return names.some(
    (name) =>
      value[name] === expected || (isRecord(value.config) && value.config[name] === expected),
  );
}

/**
 * Searches already projected public record text.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param query - Validated native query fields.
 * @returns Whether public JSON contains the normalized search text.
 */
function includesText(value: JsonValue, query: string): boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).toLowerCase().includes(query);
  }
  if (Array.isArray(value)) return value.some((item) => includesText(item, query));
  return (
    isRecord(value) && Object.values(value).some((item) => includesText(item as JsonValue, query))
  );
}

/**
 * Validates an integer query parameter within its declared inclusive bounds.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param name - Public field or route parameter name.
 * @param fallback - Default used only when the optional parameter is absent.
 * @returns The accepted integer or existing query failure.
 */
function readInteger(value: string | null, name: string, fallback: number): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) throw new InspectorQueryError(`${name} is invalid`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (name === "limit" && parsed < 1))
    throw new InspectorQueryError(`${name} is invalid`);
  return parsed;
}

/**
 * Selects safe source-location metadata and excludes private absolute provider paths.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Public source evidence or undefined.
 */
export function safeSource(value: unknown): JsonValue | undefined {
  if (!isRecord(value) || typeof value.file !== "string") return undefined;
  if (!Number.isInteger(value.line) || !Number.isInteger(value.column)) return undefined;
  try {
    return normalizeSourceLocation(
      value as { file: string; line: number; column: number },
    ) as unknown as JsonValue;
  } catch {
    return undefined;
  }
}

/**
 * Redacts and freezes the selected metadata before it crosses the public boundary.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param policy - Existing observability redaction policy applied before public JSON admission.
 * @returns Safe immutable JSON under the existing redaction policy.
 */
export function safeJson(value: unknown, policy?: RedactionPolicy): JsonValue {
  return redactRecord(value, policy);
}

/**
 * Selects only declared public fields from a record.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @param keys - Explicit public fields selected before redaction.
 * @returns A shallow public field projection.
 */
export function pick(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor && descriptor.value !== undefined)
      result[key] = descriptor.value;
  }
  return result;
}

/**
 * Projects the authoritative active generation and graph identity.
 * @param generation - Authorized active generation supplying declaration metadata and native authorities.
 * @returns The existing public identity envelope.
 */
export function identity(generation: ResolvedActiveGeneration): Record<string, JsonValue> {
  return {
    protocol: "relkit.inspector",
    version: API_VERSION,
    generationId: generation.generationId,
    graphHash: generation.graphHash,
    ...(generation.activationFingerprint === undefined
      ? {}
      : { activationFingerprint: safeJson(generation.activationFingerprint) }),
  };
}

/**
 * Resolves the supported native collection shapes without owning a new runtime.
 * @param source - Native or stored source whose public value is resolved selectively.
 * @returns The native list result or stored collection value.
 */
export async function resolveCollection(source: unknown): Promise<unknown> {
  const value = await resolveService(source);
  if (isRecord(value) && typeof value.list === "function") return await value.list();
  if (isRecord(value) && typeof value.query === "function")
    return await value.query({ limit: 100 });
  return value;
}

/**
 * Resolves one record through the existing native detail authority.
 * @param source - Native or stored source whose public value is resolved selectively.
 * @param id - Declaration or native record identifier selected by the caller.
 * @returns The native detail result or undefined.
 */
export async function resolveItem(source: unknown, id: string): Promise<unknown> {
  const value = await resolveService(source);
  return isRecord(value) && typeof value.get === "function" ? await value.get(id) : undefined;
}
