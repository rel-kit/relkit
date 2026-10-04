import { deepFreeze, type JsonValue } from "@relkit/contracts";
import { isRecord, pick, safeJson, safeSource } from "./shared.js";
import { projectAppNode, projectProviderNode } from "./topology.js";

/** Public stored graph metadata fields selected before redaction; accessors are skipped. */
const GRAPH_FIELDS = `
environment providerBindings observability defaults name type requiredIn hasDefault sensitive
description input output errors dependencies timeoutMs concurrency generated triggerType invocationMode publishes
targetFunctionId config method path request responses middleware transforms eventId eventVersion
delivery profile retry schedule idempotency version sensitiveFields visibility maxObjectBytes
allowedContentTypes key value defaultTtlMs maxTtlMs sideEffect approval model toolIds limits
generatedFunction capabilities capability adapter ownership configuration
title tags members functions events order ownerId ownerKind phase domainId exposure data http retry
execution workflow workflowTopology subagents resourceDependencies backendBucketId
client chat controls stateProfile clientContract
`
  .trim()
  .split(/\s+/);

/**
 * Projects stored public graph metadata while skipping executable accessor properties.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns A redacted public node or undefined for an invalid declaration.
 */
export function projectNode(value: unknown): JsonValue | undefined {
  if (
    !isRecord(value) ||
    typeof ownField(value, "kind") !== "string" ||
    typeof ownField(value, "id") !== "string"
  )
    return undefined;
  if (value.kind === "provider") return projectProviderNode(value);
  if (value.kind === "app") return projectAppNode(value);
  const result: Record<string, unknown> = { kind: value.kind, id: value.id };
  const source = safeSource(ownField(value, "source"));
  if (source !== undefined) result.source = source;
  for (const key of GRAPH_FIELDS) {
    const metadata = ownField(value, key);
    if (metadata === undefined) continue;
    const field = safeJson({ value: metadata });
    if (isRecord(field) && field.value !== undefined) result[key] = field.value;
  }
  const projected = safeJson(result);
  const config = ownField(value, "config");
  if (!isRecord(projected) || !isRecord(config)) return projected;
  const request = safeConfigRequest(ownField(config, "request"));
  if (request === undefined || !isRecord(projected.config)) return projected;
  return deepFreeze({ ...projected, config: { ...projected.config, request } }) as JsonValue;
}

/**
 * Reads graph metadata only from a stored own data property.
 * @param value - Graph declaration record; getters are executable private behavior.
 * @param key - Public metadata field selected by the projection.
 * @returns Stored metadata, or undefined for absent/accessor/inherited properties.
 */
function ownField(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
}

/**
 * Projects stored HTTP request metadata without executable schema behavior.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Redacted request metadata, or undefined when unavailable.
 */
function safeConfigRequest(value: unknown): JsonValue | undefined {
  const field = safeJson({ value });
  return isRecord(field) && field.value !== undefined ? field.value : undefined;
}

/**
 * Projects declaration records individually before filtering unavailable records.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Public descriptors in declaration order.
 */
export function projectDescriptors(value: unknown): JsonValue[] {
  return toItems(value).flatMap((item) => {
    const projected = projectNode(item);
    return projected === undefined ? [] : [projected];
  });
}

/**
 * Selects public observed-edge endpoints and relationship fields.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Redacted observed edges in source order.
 */
export function projectObservedEdges(value: unknown): JsonValue[] {
  return toItems(value).flatMap((edge) => {
    if (!isRecord(edge) || typeof edge.from !== "string" || typeof edge.to !== "string") return [];
    return [safeJson(pick(edge, ["relationship", "kind", "from", "to"]))];
  });
}

/**
 * Normalizes the supported array, page and singleton collection shapes.
 * @param value - Candidate metadata value, checked before selecting public fields.
 * @returns Native collection values without deep traversal.
 */
export function toItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.items)) return value.items;
  return value === undefined || value === null ? [] : [value];
}
