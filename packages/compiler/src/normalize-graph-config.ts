import type { JsonValue } from "@zsys/contracts";
import { selectorEntries } from "./normalize-compat.js";
import { clean } from "./normalize-graph-utils.js";
import type { NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord, refId } from "./normalize-utils.js";

export function httpConfig(
  descriptor: NormalizedDescriptor,
  value: Record<string, unknown>,
  work: NormalizationWork,
): JsonValue {
  return clean({
    method: value.method,
    path: value.path,
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(Array.isArray(value.tags) ? { tags: clean(value.tags) } : {}),
    runtimePaths: value.runtimePaths,
    request: value.request,
    responses: responses(value.responses, descriptor.id, work),
    middleware: middleware(value.middleware, work),
    transforms: transforms(value.request, work),
    rateLimit: rateLimit(value.rateLimit),
    maxBodyBytes: value.maxBodyBytes,
    timeoutMs: value.timeoutMs,
  });
}

function rateLimit(value: unknown): JsonValue | undefined {
  if (!isRecord(value)) return undefined;
  return clean({
    limit: value.limit,
    windowMs: value.windowMs,
    key: value.key,
    storeId: refId(value.store),
  });
}

export function eventConfig(
  descriptor: NormalizedDescriptor,
  value: Record<string, unknown>,
  work: NormalizationWork,
): JsonValue {
  const expansion = work.selectorExpansions.get(descriptor.id) ?? selectorEntries(value.selector);
  return clean({
    selector: value.selector,
    expansion: sortEventPairs(expansion),
    delivery: value.delivery,
    profile: value.profile,
    retry: value.retry,
    concurrency: value.concurrency,
  });
}

export function middlewareTargetIds(
  value: unknown,
  work: NormalizationWork,
): readonly { readonly id: string; readonly targetFunctionId: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const id = refId(entry);
    if (id === undefined) return [];
    const middleware = work.middlewareReferences.get(id);
    const target = isRecord(middleware?.value) ? refId(middleware.value.target) : undefined;
    return [{ id, targetFunctionId: target ?? "" }];
  });
}

function middleware(value: unknown, work: NormalizationWork): JsonValue {
  return middlewareTargetIds(value, work).map((entry) => ({ ...entry }));
}

function responses(value: unknown, descriptorId: string, work: NormalizationWork): JsonValue {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (!isRecord(entry)) return clean(entry);
    const responseId = typeof entry.id === "string" ? entry.id : "";
    return clean({
      ...entry,
      schema: work.schemas.get(`${descriptorId}:response:${responseId}`) ?? null,
    });
  });
}

function transforms(value: unknown, work: NormalizationWork): JsonValue {
  const ids: string[] = [];
  collectTransforms(value, ids);
  return [...new Set(ids)].map((id) => ({
    id,
    schema: work.schemas.get(`${id}:transform`) ?? null,
  }));
}

function collectTransforms(value: unknown, ids: string[]): void {
  if (!isRecord(value)) return;
  if (value.kind === "transform" && typeof value.transformId === "string") {
    ids.push(value.transformId);
    collectTransforms(value.value, ids);
    return;
  }
  if ((value.kind === "input" || value.kind === "nested") && isRecord(value.fields)) {
    Object.values(value.fields).forEach((field) => collectTransforms(field, ids));
    return;
  }
  if (value.kind === "optional" || value.kind === "default") collectTransforms(value.value, ids);
}

function sortEventPairs(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => {
    const a = splitEventPair(left);
    const b = splitEventPair(right);
    return a.id.localeCompare(b.id) || a.version - b.version || left.localeCompare(right);
  });
}

function splitEventPair(value: string): { readonly id: string; readonly version: number } {
  const at = value.lastIndexOf("@");
  const version = Number(value.slice(at + 1));
  return {
    id: at < 0 ? value : value.slice(0, at),
    version: Number.isFinite(version) ? version : 0,
  };
}
