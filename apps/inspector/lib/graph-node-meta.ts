/** Typed readers over the raw projected metadata a graph node carries. */
import type { GraphNode } from "./graph-model";
import { schemaFields, schemaRecord, unwrapSchema } from "./schema-model";
import { meta, number, record, records, strings, text } from "./graph-node-meta-values";

export type { ColumnSpec, TableSpec } from "./graph-node-meta-capability";
export { capabilityDetail, capabilityKind, databaseTables } from "./graph-node-meta-capability";
export {
  agentModel,
  agentToolIds,
  channelClient,
  channelEvents,
  channelParams,
  envOptional,
  envSensitive,
  envType,
  errorRetry,
  errorStatus,
  eventPayload,
  eventVersion,
  providerAdapter,
  providerCapability,
  toolApproval,
  toolSideEffect,
} from "./graph-node-meta-details";

export interface NodeSource {
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
}

export interface RequestField {
  readonly name: string;
  readonly location: string;
  readonly optional: boolean;
}

export interface ResponseSpec {
  readonly id: string;
  readonly kind: string;
  readonly status: number;
  readonly schema?: unknown;
  readonly errorId?: string;
}

export interface ErrorRef {
  readonly id: string;
  readonly status?: number;
}

export type TriggerType = "http" | "event" | "schedule" | "queue";

export function nodeSource(node: GraphNode): NodeSource | undefined {
  const source = record(meta(node).source);
  const file = text(source?.file);
  if (file === undefined) return undefined;
  const line = number(source?.line);
  const column = number(source?.column);
  return {
    file,
    ...(line === undefined ? {} : { line }),
    ...(column === undefined ? {} : { column }),
  };
}

export function nodeDescription(node: GraphNode): string | undefined {
  const value = meta(node);
  return text(value.description) ?? text(value.title) ?? text(value.instructions);
}

export function triggerType(node: GraphNode): TriggerType | undefined {
  const value = meta(node).triggerType;
  return value === "http" || value === "event" || value === "schedule" || value === "queue"
    ? value
    : undefined;
}

export function isRoute(node: GraphNode): boolean {
  return node.kind === "trigger" && triggerType(node) === "http";
}

export function isListener(node: GraphNode): boolean {
  return node.kind === "trigger" && triggerType(node) === "event";
}

export function isScheduleTrigger(node: GraphNode): boolean {
  return node.kind === "trigger" && triggerType(node) === "schedule";
}

export function targetFunctionId(node: GraphNode): string | undefined {
  return text(meta(node).targetFunctionId);
}

function triggerConfig(node: GraphNode): Record<string, unknown> {
  return record(meta(node).config) ?? {};
}

export function routeMethod(node: GraphNode): string | undefined {
  return text(triggerConfig(node).method);
}

export function routePath(node: GraphNode): string | undefined {
  return text(triggerConfig(node).path);
}

/** Whether a route streams its response (server-sent events or a chunked stream). */
export function routeStreams(node: GraphNode): boolean {
  const stream = triggerConfig(node).stream;
  return stream !== undefined && stream !== null && stream !== false;
}

export function routeAuth(node: GraphNode): string | undefined {
  const auth = record(triggerConfig(node).auth);
  return text(auth?.kind);
}

export function routeMiddleware(node: GraphNode): readonly string[] {
  return records(triggerConfig(node).middleware).flatMap((item) => text(item.id) ?? []);
}

export function routeRequestFields(node: GraphNode): readonly RequestField[] {
  const request = record(triggerConfig(node).request);
  const fields = record(request?.fields);
  if (fields === undefined) return [];
  return Object.entries(fields).flatMap(([name, raw]) => {
    const field = record(raw);
    if (field === undefined) return [];
    const optional = field.kind === "optional";
    const inner = optional ? (record(field.value) ?? {}) : field;
    const location = text(inner.kind) ?? "input";
    return [{ name: text(inner.name) ?? name, location, optional }];
  });
}

export function routeResponses(node: GraphNode): readonly ResponseSpec[] {
  return records(triggerConfig(node).responses).flatMap((response) => {
    const id = text(response.id);
    const status = number(response.status);
    if (id === undefined || status === undefined) return [];
    const errorId = text(response.errorId);
    return [
      {
        id,
        kind: text(response.kind) ?? "success",
        status,
        ...(response.schema === undefined ? {} : { schema: response.schema }),
        ...(errorId === undefined ? {} : { errorId }),
      },
    ];
  });
}

export function routeGroupRouteIds(node: GraphNode): readonly string[] {
  return strings(meta(node).routeIds);
}

export function routeGroupMethods(node: GraphNode): readonly { method: string; count: number }[] {
  const methods = record(meta(node).methods);
  return methods === undefined
    ? []
    : Object.entries(methods).flatMap(([method, count]) =>
        typeof count === "number" ? [{ method, count }] : [],
      );
}

export function listenedEventId(node: GraphNode): string | undefined {
  return text(triggerConfig(node).eventId);
}

export function functionInput(node: GraphNode): unknown {
  return meta(node).input;
}

export function functionOutput(node: GraphNode): unknown {
  return meta(node).output;
}

export function schemaFieldCount(schema: unknown): number {
  return schemaFields(schema).length;
}

export function functionErrors(node: GraphNode): readonly ErrorRef[] {
  return records(meta(node).errors).flatMap((error) => {
    const id = text(error.id) ?? text(record(error.ref)?.id);
    if (id === undefined) return [];
    const status = number(record(error.http)?.status);
    return [{ id, ...(status === undefined ? {} : { status }) }];
  });
}

export function functionPublishes(node: GraphNode): readonly string[] {
  return strings(meta(node).publishes);
}

export function invocationMode(node: GraphNode): string | undefined {
  return text(meta(node).invocationMode);
}

export function schemaSummary(schema: unknown): string | undefined {
  const unwrapped = schemaRecord(unwrapSchema(schema));
  if (unwrapped === undefined) return undefined;
  const fields = schemaFields(unwrapped);
  if (fields.length > 0) return `${fields.length} ${fields.length === 1 ? "field" : "fields"}`;
  const type = text(unwrapped.type);
  return type === undefined ? undefined : type;
}

/** Short name used on cards: the id without its domain prefix, or the transport for routes. */
export function nodeTitle(node: GraphNode): string {
  if (node.label !== undefined) return node.label;
  if (isRoute(node)) {
    const method = routeMethod(node);
    const path = routePath(node);
    if (method !== undefined && path !== undefined) return `${method} ${path}`;
  }
  if (isListener(node)) {
    const event = listenedEventId(node);
    if (event !== undefined) return `on ${event}`;
  }
  if (node.kind === "table") return node.id.replace(/^table:/, "");
  if (node.kind === "provider") return node.id.replace(/^provider\./, "");
  if (node.domainId !== undefined && node.id.startsWith(`${node.domainId}.`))
    return node.id.slice(node.domainId.length + 1);
  return node.id;
}
