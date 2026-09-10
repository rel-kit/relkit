import type { MiddlewareDescriptor } from "@relkit/routes";
import type { StandardSchemaV1 } from "@relkit/schema";
import { asyncIteratorObject } from "@orpc/server";
import { isRecord } from "./materialize-routes-utils.js";
import type { HttpTriggerRegistration } from "@relkit/graph";

export function isSchema(value: unknown): value is StandardSchemaV1 {
  return isRecord(value) && isRecord(value["~standard"]) && value["~standard"].version === 1;
}

export function rpcOutputSchema(schema: StandardSchemaV1): StandardSchemaV1 {
  return isStreamSchema(schema) ? (asyncIteratorObject(schema.item) as StandardSchemaV1) : schema;
}

export function rpcOutput(schema: StandardSchemaV1, value: unknown): unknown {
  if (!isStreamSchema(schema) || !isAsyncIterable(value)) return value;
  const iterator = value[Symbol.asyncIterator]();
  if (isAsyncIteratorObject(iterator)) return iterator;
  return {
    next: () => iterator.next(),
    return: (result?: unknown) => iterator.return?.(result) ?? Promise.resolve({ done: true }),
    throw: (error?: unknown) => iterator.throw?.(error) ?? Promise.reject(error),
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

export function isMiddleware(value: unknown): value is MiddlewareDescriptor {
  return isRecord(value) && typeof value.handler === "function";
}

export function errorStatuses(trigger: HttpTriggerRegistration): [string, number][] {
  return Array.isArray(trigger.config.responses)
    ? trigger.config.responses.flatMap((entry) =>
        isRecord(entry) && typeof entry.errorId === "string" && typeof entry.status === "number"
          ? [[entry.errorId, entry.status]]
          : [],
      )
    : [];
}

export function routeOperation(trigger: HttpTriggerRegistration): "query" | "mutation" {
  const configured = trigger.config.client;
  if (configured !== false && configured?.operation !== undefined) return configured.operation;
  return ["GET", "HEAD", "OPTIONS"].includes(trigger.config.method) ? "query" : "mutation";
}

function isStreamSchema(
  value: StandardSchemaV1,
): value is StandardSchemaV1 & { readonly kind: "stream"; readonly item: StandardSchemaV1 } {
  return isRecord(value) && value.kind === "stream" && isSchema(value.item);
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    isRecord(value) &&
    typeof (value as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function"
  );
}

function isAsyncIteratorObject(
  value: AsyncIterator<unknown>,
): value is AsyncIteratorObject<unknown> {
  return typeof (value as Partial<AsyncIterable<unknown>>)[Symbol.asyncIterator] === "function";
}
