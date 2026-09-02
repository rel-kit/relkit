import type { JsonValue } from "@relkit/contracts";
import { clean } from "./normalize-graph-utils.js";
import { middlewareForRoute } from "./middleware-coverage.js";
import type { NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord, refId } from "./normalize-utils.js";
import { selectedProviderProfile } from "./normalize-graph-app.js";

export function httpConfig(
  descriptor: NormalizedDescriptor,
  value: Record<string, unknown>,
  work: NormalizationWork,
): JsonValue {
  return clean({
    method: value.method,
    path: value.path,
    ...(value.raw === true ? { rawHandler: true } : {}),
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(Array.isArray(value.tags) ? { tags: clean(value.tags) } : {}),
    runtimePaths: value.runtimePaths,
    request: value.request,
    responses: responses(value.responses, descriptor.id, work),
    middleware: middlewareForRoute(descriptor, work),
    transforms: transforms(value.request, work),
    rateLimit: rateLimit(value.rateLimit),
    maxBodyBytes: value.maxBodyBytes,
    timeoutMs: value.timeoutMs,
    auth: authConfig(value.auth),
  });
}

function authConfig(value: unknown): JsonValue | undefined {
  if (!isRecord(value) || value.kind !== "better-auth") return undefined;
  return clean({
    kind: "better-auth",
    serviceId: refId(value.service),
    protected: value.protected,
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
  const application = work.descriptors.find((entry) => entry.kind === "app")?.value;
  return clean({
    eventId: value.eventId,
    eventVersion: value.eventVersion,
    delivery: value.delivery,
    profile: selectedProviderProfile(
      application,
      "event",
      typeof value.profile === "string" ? value.profile : undefined,
    ),
    retry: value.retry,
    ...(value.concurrency === undefined ? {} : { concurrency: value.concurrency }),
    ...(value.timeoutMs === undefined ? {} : { timeoutMs: value.timeoutMs }),
  });
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
