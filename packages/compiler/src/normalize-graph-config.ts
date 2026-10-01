import type { JsonValue } from "@relkit/contracts";
import { clean } from "./normalize-graph-utils.js";
import { middlewareForRouteEffect } from "./middleware-coverage.js";
import { Effect } from "effect";
import { runCompilerSync } from "./compatibility.js";
import type { NormalizedDescriptor, NormalizationWork } from "./normalize-types.js";
import { isRecord, refId } from "./normalize-utils.js";
import { selectedProviderProfile } from "./normalize-graph-app.js";

/**
 * Projects the route's target, policy, response, and transform graph metadata.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param value - Declared metadata inspected without coercion.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns A lazy effect yielding HTTP metadata; middleware selection composes in the caller's runtime.
 */
export const httpConfigEffect = Effect.fnUntraced(function* (
  descriptor: NormalizedDescriptor,
  value: Record<string, unknown>,
  work: NormalizationWork,
) {
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
    middleware: yield* middlewareForRouteEffect(descriptor, work),
    transforms: transforms(value.request, work),
    rateLimit: rateLimit(value.rateLimit),
    maxBodyBytes: value.maxBodyBytes,
    timeoutMs: value.timeoutMs,
    client: clientPolicy(value.client, value.method),
    stream: value.stream,
    auth: authConfig(value.auth),
  });
});

/** Projects HTTP metadata at the synchronous compatibility boundary. */
export function httpConfig(
  descriptor: NormalizedDescriptor,
  value: Record<string, unknown>,
  work: NormalizationWork,
): JsonValue {
  return runCompilerSync(httpConfigEffect(descriptor, value, work));
}

/**
 * Projects the client invocation policy for an HTTP operation.
 * @param value - Declared metadata inspected without coercion.
 * @param method - Normalized HTTP method.
 * @returns Serializable client invocation policy, or undefined when omitted.
 */
function clientPolicy(value: unknown, method: unknown): JsonValue | undefined {
  if (value === false) return false;
  const operation =
    isRecord(value) && (value.operation === "query" || value.operation === "mutation")
      ? value.operation
      : method === "GET" || method === "HEAD" || method === "OPTIONS"
        ? "query"
        : "mutation";
  return { operation };
}

/**
 * Projects route authentication metadata without executable values.
 * @param value - Declared metadata inspected without coercion.
 * @returns Serializable route authentication settings, or undefined when omitted.
 */
function authConfig(value: unknown): JsonValue | undefined {
  if (!isRecord(value) || value.kind !== "better-auth") return undefined;
  return clean({
    kind: "better-auth",
    serviceId: refId(value.service),
    protected: value.protected,
  });
}

/**
 * Projects normalized HTTP rate-limit metadata.
 * @param value - Declared metadata inspected without coercion.
 * @returns Normalized rate-limit metadata, or undefined when omitted.
 */
function rateLimit(value: unknown): JsonValue | undefined {
  if (!isRecord(value)) return undefined;
  return clean({
    limit: value.limit,
    windowMs: value.windowMs,
    key: value.key,
    storeId: refId(value.store),
  });
}

/**
 * Projects event contract and target graph metadata.
 * @param descriptor - Normalized descriptor whose identity and metadata are inspected.
 * @param value - Declared metadata inspected without coercion.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Serializable event contract and target metadata.
 */
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

/**
 * Projects declared response schemas and identities for a route.
 * @param value - Declared metadata inspected without coercion.
 * @param descriptorId - Stable descriptor identity.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Response status contracts and schema references.
 */
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

/**
 * Projects transform identities in a mapping.
 * @param value - Declared metadata inspected without coercion.
 * @param work - Invocation-owned normalization state, indexes, and diagnostics.
 * @returns Transform identities without retaining executable functions.
 */
function transforms(value: unknown, work: NormalizationWork): JsonValue {
  const ids: string[] = [];
  collectTransforms(value, ids);
  return [...new Set(ids)].map((id) => ({
    id,
    schema: work.schemas.get(`${id}:transform`) ?? null,
  }));
}

/**
 * Collects nested transform descriptors without losing ownership evidence.
 * @param value - Declared metadata inspected without coercion.
 * @param ids - Stable identities in declaration order.
 * @returns Nothing; updates only the supplied diagnostics, indexes, or accumulators.
 */
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
