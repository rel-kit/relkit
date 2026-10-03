import { asyncIteratorObject } from "@orpc/server";
import type { HttpTriggerRegistration } from "@relkit/graph";
import type { MiddlewareDescriptor } from "@relkit/routes";
import type { StandardSchemaV1 } from "@relkit/schema";
import { isRecord } from "./materialize-routes-utils.js";

/** Recognize a Standard Schema v1 descriptor at the RPC boundary.
 * @param value - Value to validate or project.
 * @returns Whether the value exposes the supported Standard Schema marker.
 */
export function isSchema(value: unknown): value is StandardSchemaV1 {
  return isRecord(value) && isRecord(value["~standard"]) && value["~standard"].version === 1;
}

/** Adapt RELKIT stream schemas to oRPC's async iterator schema.
 * @param schema - Schema used to validate or infer the value.
 * @returns The stream item iterator schema or the original scalar schema.
 */
export function rpcOutputSchema(schema: StandardSchemaV1): StandardSchemaV1 {
  return isStreamSchema(schema) ? (asyncIteratorObject(schema.item) as StandardSchemaV1) : schema;
}

/** Adapt a stream result to the async iterator object required by oRPC.
 * @param schema - Schema used to validate or infer the value.
 * @param value - Value to validate or project.
 * @returns An iterator forwarding next/return/throw, or the unchanged scalar value.
 */
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

/** Recognize a manifest middleware descriptor by its callable handler.
 * @param value - Value to validate or project.
 * @returns Whether the value exposes a handler function.
 */
export function isMiddleware(value: unknown): value is MiddlewareDescriptor {
  return isRecord(value) && typeof value.handler === "function";
}

/** Collect declared route error IDs and their HTTP statuses.
 * @param trigger - Compiled HTTP trigger registration.
 * @returns Error/status tuples from supported response declarations.
 */
export function errorStatuses(trigger: HttpTriggerRegistration): [string, number][] {
  return Array.isArray(trigger.config.responses)
    ? trigger.config.responses.flatMap((entry) =>
        isRecord(entry) && typeof entry.errorId === "string" && typeof entry.status === "number"
          ? [[entry.errorId, entry.status]]
          : [],
      )
    : [];
}

/** Use an explicit client operation or infer it from the HTTP method.
 * @param trigger - Compiled HTTP trigger registration.
 * @returns Query for safe read methods, otherwise mutation.
 */
export function routeOperation(trigger: HttpTriggerRegistration): "query" | "mutation" {
  const configured = trigger.config.client;
  if (configured !== false && configured?.operation !== undefined) return configured.operation;
  return ["GET", "HEAD", "OPTIONS"].includes(trigger.config.method) ? "query" : "mutation";
}

/** Recognize a RELKIT stream schema with a Standard Schema item.
 * @param value - Value to validate or project.
 * @returns Whether the schema requires an iterator output adapter.
 */
function isStreamSchema(
  value: StandardSchemaV1,
): value is StandardSchemaV1 & { readonly kind: "stream"; readonly item: StandardSchemaV1 } {
  return isRecord(value) && value.kind === "stream" && isSchema(value.item);
}

/** Check for the async iterator factory used by stream responses.
 * @param value - Value to validate or project.
 * @returns Whether the value can produce an async iterator.
 */
function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    isRecord(value) &&
    typeof (value as unknown as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function"
  );
}

/** Check whether an iterator also exposes its async iterable interface.
 * @param value - Value to validate or project.
 * @returns Whether the iterator already satisfies oRPC's object contract.
 */
function isAsyncIteratorObject(
  value: AsyncIterator<unknown>,
): value is AsyncIteratorObject<unknown> {
  return typeof (value as Partial<AsyncIterable<unknown>>)[Symbol.asyncIterator] === "function";
}
