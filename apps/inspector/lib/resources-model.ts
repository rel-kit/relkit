import type { InspectorObject } from "./api-types";
import {
  capabilityNames,
  descriptor,
  operationViews,
  runtimeId,
  stats,
} from "./resources-model-utils";

export type ResourceKind = "bucket" | "cache";
export type ResourceOperation =
  | "put"
  | "get"
  | "head"
  | "delete"
  | "exists"
  | "list"
  | "createReadUrl"
  | "createWriteUrl"
  | "set"
  | "has"
  | "getOrSet"
  | "increment";
export type OperationStatus = "declared" | "supported" | "unsupported" | "not-advertised";

export interface ResourceOperationView {
  readonly name: ResourceOperation;
  readonly status: OperationStatus;
}

export interface ResourceSource {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface ResourceDescriptorView {
  readonly source?: ResourceSource;
  readonly visibility?: string;
  readonly maxObjectBytes?: number;
  readonly allowedContentTypes?: readonly string[];
  readonly keySchema?: unknown;
  readonly valueSchema?: unknown;
  readonly defaultTtlMs?: number;
  readonly maxTtlMs?: number;
}

export interface ResourceView {
  readonly kind: ResourceKind;
  readonly id: string;
  readonly profile: string;
  readonly descriptor: ResourceDescriptorView;
  readonly capabilities: readonly string[];
  readonly operations: readonly ResourceOperationView[];
  readonly stats: Readonly<Record<string, number>>;
  readonly runtimeState?: string;
}

export function resourceViews(
  kind: ResourceKind,
  nodes: readonly InspectorObject[],
  runtime: readonly InspectorObject[],
): readonly ResourceView[] {
  return nodes
    .filter((node) => node.kind === kind)
    .flatMap((node) => {
      const id = text(node.id);
      if (id === "") return [];
      return [
        resourceView(
          kind,
          node,
          runtime.find((item) => runtimeId(kind, item) === id),
        ),
      ];
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function resourceView(
  kind: ResourceKind,
  node: InspectorObject,
  runtime?: InspectorObject,
): ResourceView {
  const id = text(node.id) || text(runtimeId(kind, runtime)) || "unknown";
  const capabilities = capabilityNames(runtime?.capabilities);
  return {
    kind,
    id,
    profile: text(node.profile) || text(runtime?.profile) || "default",
    descriptor: descriptor(kind, node),
    capabilities,
    operations: operationViews(kind, runtime?.capabilities),
    stats: stats(runtime),
    ...(text(runtime?.state) || text(runtime?.status)
      ? { runtimeState: text(runtime?.state) || text(runtime?.status) }
      : {}),
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}
