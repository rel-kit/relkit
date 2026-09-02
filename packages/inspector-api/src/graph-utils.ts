import { deepFreeze, type JsonValue } from "@relkit/contracts";
import { isRecord, pick, safeJson, safeSource } from "./shared.js";
import { projectAppNode, projectProviderNode } from "./topology.js";

const GRAPH_FIELDS = `
environment providerBindings observability defaults name type requiredIn hasDefault sensitive
description input output errors dependencies timeoutMs concurrency generated triggerType invocationMode publishes
targetFunctionId config method path request responses middleware transforms eventId eventVersion
delivery profile retry schedule idempotency version sensitiveFields visibility maxObjectBytes
allowedContentTypes key value defaultTtlMs maxTtlMs sideEffect approval model toolIds limits
generatedFunction capabilities capability adapter ownership configuration
title tags members functions events order ownerId ownerKind phase domainId exposure data http retry
`
  .trim()
  .split(/\s+/);

export function projectNode(value: unknown): JsonValue | undefined {
  if (!isRecord(value) || typeof value.kind !== "string" || typeof value.id !== "string")
    return undefined;
  if (value.kind === "provider") return projectProviderNode(value);
  if (value.kind === "app") return projectAppNode(value);
  const result: Record<string, unknown> = { kind: value.kind, id: value.id };
  const source = safeSource(value.source);
  if (source !== undefined) result.source = source;
  for (const key of GRAPH_FIELDS) {
    if (value[key] === undefined) continue;
    const field = safeJson({ value: value[key] });
    if (isRecord(field) && field.value !== undefined) result[key] = field.value;
  }
  const projected = safeJson(result);
  if (!isRecord(projected) || !isRecord(value.config)) return projected;
  const request = safeConfigRequest(value.config.request);
  if (request === undefined || !isRecord(projected.config)) return projected;
  return deepFreeze({ ...projected, config: { ...projected.config, request } }) as JsonValue;
}

function safeConfigRequest(value: unknown): JsonValue | undefined {
  const field = safeJson({ value });
  return isRecord(field) && field.value !== undefined ? field.value : undefined;
}

export function projectDescriptors(value: unknown): JsonValue[] {
  return toItems(value).flatMap((item) => {
    const projected = projectNode(item);
    return projected === undefined ? [] : [projected];
  });
}

export function projectObservedEdges(value: unknown): JsonValue[] {
  return toItems(value).flatMap((edge) => {
    if (!isRecord(edge) || typeof edge.from !== "string" || typeof edge.to !== "string") return [];
    return [safeJson(pick(edge, ["relationship", "kind", "from", "to"]))];
  });
}

export function toItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.items)) return value.items;
  return value === undefined || value === null ? [] : [value];
}
