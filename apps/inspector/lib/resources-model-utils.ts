import type { InspectorObject } from "./api-types";
import type {
  OperationStatus,
  ResourceDescriptorView,
  ResourceKind,
  ResourceOperation,
  ResourceOperationView,
  ResourceSource,
} from "./resources-model";
import { projectSource } from "./source-links";

export const BUCKET_OPERATIONS: readonly ResourceOperation[] = [
  "put",
  "get",
  "head",
  "delete",
  "exists",
  "list",
  "createReadUrl",
  "createWriteUrl",
];
export const CACHE_OPERATIONS: readonly ResourceOperation[] = [
  "get",
  "set",
  "delete",
  "has",
  "getOrSet",
  "increment",
];
const STATS = ["objects", "entries", "bytes", "hits", "misses", "evictions", "inFlight"];

export function descriptor(kind: ResourceKind, node: InspectorObject): ResourceDescriptorView {
  const source = sourceLocation(node.source);
  if (kind === "bucket") {
    return {
      ...(source === undefined ? {} : { source }),
      ...(typeof node.visibility === "string" ? { visibility: node.visibility } : {}),
      ...(number(node.maxObjectBytes) === undefined
        ? {}
        : { maxObjectBytes: number(node.maxObjectBytes) }),
      ...(stringList(node.allowedContentTypes) === undefined
        ? {}
        : { allowedContentTypes: stringList(node.allowedContentTypes) }),
    };
  }
  return {
    ...(source === undefined ? {} : { source }),
    ...(node.key === undefined ? {} : { keySchema: node.key }),
    ...(node.value === undefined ? {} : { valueSchema: node.value }),
    ...(number(node.defaultTtlMs) === undefined ? {} : { defaultTtlMs: number(node.defaultTtlMs) }),
    ...(number(node.maxTtlMs) === undefined ? {} : { maxTtlMs: number(node.maxTtlMs) }),
  };
}

export function operationViews(
  kind: ResourceKind,
  capabilities: unknown,
): readonly ResourceOperationView[] {
  return (kind === "bucket" ? BUCKET_OPERATIONS : CACHE_OPERATIONS).map((name) => ({
    name,
    status: optionalCapability(kind, name)
      ? capabilityStatus(capabilities, capabilityName(kind, name)!)
      : "declared",
  }));
}

export function capabilityNames(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .flatMap(([key, item]) => {
      if (item === true) return [key];
      if (item === false) return [`${key}:unsupported`];
      if (typeof item === "string" || typeof item === "number") return [`${key}:${item}`];
      return [];
    })
    .sort((left, right) => left.localeCompare(right));
}

export function stats(value: InspectorObject | undefined): Readonly<Record<string, number>> {
  if (value === undefined) return {};
  return Object.fromEntries(
    STATS.flatMap((key) => (number(value[key]) === undefined ? [] : [[key, number(value[key])!]])),
  );
}

export function runtimeId(kind: ResourceKind, value: InspectorObject | undefined): string {
  return text(value?.[kind === "bucket" ? "bucketId" : "cacheId"]) || text(value?.id) || "";
}

function optionalCapability(kind: ResourceKind, operation: ResourceOperation): boolean {
  return kind === "bucket"
    ? operation === "createReadUrl" || operation === "createWriteUrl"
    : operation === "increment";
}

function capabilityName(kind: ResourceKind, operation: ResourceOperation): string | undefined {
  if (kind === "bucket" && operation === "createReadUrl") return "signedReadUrl";
  if (kind === "bucket" && operation === "createWriteUrl") return "signedWriteUrl";
  return kind === "cache" && operation === "increment" ? "increment" : undefined;
}

function capabilityStatus(capabilities: unknown, name: string): OperationStatus {
  if (Array.isArray(capabilities))
    return capabilities.includes(name) ? "supported" : "not-advertised";
  if (isRecord(capabilities) && typeof capabilities[name] === "boolean")
    return capabilities[name] ? "supported" : "unsupported";
  return "not-advertised";
}

function sourceLocation(value: unknown): ResourceSource | undefined {
  return projectSource(value);
}

function stringList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((item) => typeof item === "string") ? value : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is InspectorObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
