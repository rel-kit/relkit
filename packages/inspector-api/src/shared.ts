import {
  API_VERSION,
  normalizeSourceLocation,
  type JsonValue,
  type MaybePromise,
} from "@zsys/contracts";
import { redactRecord, type RedactionPolicy } from "@zsys/observability";
import type { InspectorActionServices } from "./actions.js";
import type {
  InspectorCandidateGenerationSource,
  ResolvedCandidateGeneration,
} from "./generation-types.js";
export type InspectorMode = "development" | "test" | "production";
export type InspectorValueSource<T = unknown> = T | (() => MaybePromise<T>);
export interface InspectorRuntimeServices {
  readonly functions?: unknown;
  readonly jobs?: unknown;
  readonly events?: unknown;
  readonly buckets?: unknown;
  readonly cache?: unknown;
  readonly caches?: unknown;
  readonly tools?: unknown;
  readonly agents?: unknown;
}
export interface InspectorGenerationServices extends InspectorRuntimeServices {
  readonly graph?: unknown;
  readonly descriptors?: unknown;
  readonly environment?: unknown;
  readonly diagnostics?: unknown;
  readonly candidate?: unknown;
  readonly candidateGeneration?: unknown;
  readonly observedEdges?: unknown;
  readonly runtime?: InspectorRuntimeServices;
  readonly actions?: InspectorValueSource<InspectorActionServices | undefined>;
}
export interface InspectorActiveGeneration extends InspectorGenerationServices {
  readonly generationId?: string;
  readonly id?: string;
  readonly graphHash?: string;
  readonly services?: InspectorGenerationServices;
  readonly candidate?: InspectorCandidateGenerationSource;
  readonly candidateGeneration?: InspectorCandidateGenerationSource;
}
export type InspectorActiveGenerationSource =
  InspectorActiveGeneration | (() => MaybePromise<InspectorActiveGeneration | undefined>);
export interface ActiveGenerationOptions {
  readonly activeGeneration?: InspectorActiveGenerationSource;
  readonly generation?: InspectorActiveGenerationSource;
  readonly getActiveGeneration?: () => MaybePromise<InspectorActiveGeneration | undefined>;
}
export interface ResolvedActiveGeneration {
  readonly generationId: string;
  readonly graphHash: string;
  readonly graph?: unknown;
  readonly descriptors?: unknown;
  readonly diagnostics?: unknown;
  readonly observedEdges?: unknown;
  readonly runtime?: InspectorRuntimeServices;
  readonly actions?: InspectorActionServices;
  readonly candidate?: ResolvedCandidateGeneration;
}
export class InspectorQueryError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "InspectorQueryError";
  }
}
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export async function resolveValue<T>(
  source: InspectorValueSource<T> | undefined,
): Promise<T | undefined> {
  return source === undefined
    ? undefined
    : typeof source === "function"
      ? await (source as () => MaybePromise<T>)()
      : source;
}

export async function resolveService(source: unknown): Promise<unknown> {
  const value = await resolveValue(source);
  if (isRecord(value) && typeof value.snapshot === "function") return await value.snapshot();
  return value;
}

export interface Page<T extends JsonValue = JsonValue> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
}

export function page<T extends JsonValue>(items: readonly T[], request: Request): Page<T> {
  const params = new URL(request.url).searchParams;
  const search = readFilter(params.get("search"), "search");
  const kind = readFilter(params.get("kind"), "kind");
  const status = readFilter(params.get("status"), "status");
  const filtered = items.filter(
    (item) =>
      (search === undefined || includesText(item, search.toLowerCase())) &&
      (kind === undefined || matchesField(item, ["kind", "type", "method"], kind)) &&
      (status === undefined || matchesField(item, ["status", "state", "outcome"], status)),
  );
  const cursor = readInteger(params.get("cursor"), "cursor", 0);
  const limit = Math.min(readInteger(params.get("limit"), "limit", 50), 100);
  const selected = filtered.slice(cursor, cursor + limit);
  const next = cursor + selected.length;
  return next < filtered.length
    ? { items: selected, nextCursor: String(next) }
    : { items: selected };
}

function readFilter(value: string | null, name: string): string | undefined {
  if (value === null || value.trim() === "") return undefined;
  if (value.length > 128) throw new InspectorQueryError(`${name} is invalid`);
  return value.trim();
}

function matchesField(value: JsonValue, names: readonly string[], expected: string): boolean {
  if (!isRecord(value)) return false;
  return names.some(
    (name) =>
      value[name] === expected || (isRecord(value.config) && value.config[name] === expected),
  );
}

function includesText(value: JsonValue, query: string): boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).toLowerCase().includes(query);
  }
  if (Array.isArray(value)) return value.some((item) => includesText(item, query));
  return (
    isRecord(value) && Object.values(value).some((item) => includesText(item as JsonValue, query))
  );
}

function readInteger(value: string | null, name: string, fallback: number): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) throw new InspectorQueryError(`${name} is invalid`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (name === "limit" && parsed < 1))
    throw new InspectorQueryError(`${name} is invalid`);
  return parsed;
}

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

export function safeJson(value: unknown, policy?: RedactionPolicy): JsonValue {
  return redactRecord(value, policy);
}

export function pick(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const result: Record<string, unknown> = {};
  for (const key of keys) if (value[key] !== undefined) result[key] = value[key];
  return result;
}

export function identity(generation: ResolvedActiveGeneration): Record<string, JsonValue> {
  return {
    protocol: "zsys.inspector",
    version: API_VERSION,
    generationId: generation.generationId,
    graphHash: generation.graphHash,
  };
}

export async function resolveCollection(source: unknown): Promise<unknown> {
  const value = await resolveService(source);
  if (isRecord(value) && typeof value.list === "function") return await value.list();
  if (isRecord(value) && typeof value.query === "function")
    return await value.query({ limit: 100 });
  return value;
}

export async function resolveItem(source: unknown, id: string): Promise<unknown> {
  const value = await resolveService(source);
  if (isRecord(value) && typeof value.get === "function") return await value.get(id);
  return undefined;
}
