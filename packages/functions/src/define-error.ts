import { deepFreeze, normalizeId, type DescriptorMetadata } from "@zsys/contracts";
import {
  createUnboundIdentity,
  getDescriptorIdentity,
  normalizeErrorRetry,
  type ErrorRetry,
  type ErrorRetryInput,
} from "@zsys/invocation";
import {
  validateSync,
  type InferInput,
  type InferOutput,
  type StandardSchemaV1,
} from "@zsys/schema";
import { assertErrorSchema, validateErrorHttp } from "./define-error-validation.js";

export { isErrorDescriptor } from "./define-error-validation.js";

export type { ErrorRetry, ErrorRetryInput, NormalizedErrorRetry } from "@zsys/invocation";

export interface ErrorHttpMapping {
  readonly status: number;
}

export interface ErrorRef<Id extends string = string> {
  readonly kind: "error";
  readonly id: Id;
}

export class DeclaredError<Id extends string = string, Data = unknown> extends Error {
  readonly id: Id;
  readonly ref: ErrorRef<Id>;
  readonly data: Data;
  readonly retry: ErrorRetry;
  readonly afterMs?: number;
  readonly http?: ErrorHttpMapping;

  constructor(
    id: Id,
    ref: ErrorRef<Id>,
    data: Data,
    message: string,
    retry: ErrorRetry,
    afterMs: number | undefined,
    http: ErrorHttpMapping | undefined,
  ) {
    super(message);
    this.name = "DeclaredError";
    this.id = id;
    this.ref = ref;
    this.data = data;
    this.retry = retry;
    if (afterMs !== undefined) this.afterMs = afterMs;
    if (http !== undefined) this.http = http;
    Object.freeze(this);
  }
}

export interface ErrorDescriptor<
  Id extends string,
  Data,
  DataSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends DescriptorMetadata {
  readonly kind: "error";
  readonly id: Id;
  readonly ref: ErrorRef<Id>;
  readonly data: DataSchema;
  readonly message: string | ((data: Data) => string);
  readonly http?: ErrorHttpMapping;
  readonly retry: ErrorRetry;
  readonly afterMs?: number;
  readonly create: (input: InferInput<DataSchema>) => DeclaredError<Id, Data>;
  new (input: InferInput<DataSchema>): DeclaredError<Id, Data>;
}

export type ErrorDescriptorAny = ErrorDescriptor<string, any, StandardSchemaV1<any, any>>;

export interface DefineErrorOptions<
  Id extends string,
  DataSchema extends StandardSchemaV1,
> extends DescriptorMetadata {
  readonly id?: Id;
  readonly data: DataSchema;
  readonly message: string | ((data: InferOutput<DataSchema>) => string);
  readonly http?: ErrorHttpMapping;
  readonly retry?: ErrorRetryInput;
}

/**
 * Defines a typed application error with safe data, transport metadata, and an optional retry hint.
 *
 * Source-scoped errors may omit `id`; the compiler derives an identity from a statically
 * identifiable binding such as `InvalidError`. Omitted `retry` is non-retryable. Use
 * `{ kind: "later", afterMs }` to provide a minimum delay hint for jobs and durable events;
 * HTTP and direct calls never repeat the function automatically.
 *
 * @example
 * ```ts
 * import { defineError } from "@zsys/functions"
 * import { z } from "@zsys/schema"
 *
 * const notFound = defineError({
 *   id: "orders.not-found",
 *   data: z.object({ orderId: z.string() }),
 *   message: ({ orderId }) => `Order ${orderId} was not found`,
 *   http: { status: 404 },
 *   retry: "never"
 * })
 * const failure = new notFound({ orderId: "order-1" })
 * void failure
 * ```
 * @category Errors
 * @since 0.1.0
 */
export function defineError<const Id extends string, const DataSchema extends StandardSchemaV1>(
  options: DefineErrorOptions<Id, DataSchema>,
): ErrorDescriptor<Id, InferOutput<DataSchema>, DataSchema> {
  assertErrorSchema(options.data);
  if (typeof options.message !== "string" && typeof options.message !== "function") {
    throw new TypeError("Error message must be a string or function");
  }
  const id = normalizeId(
    options.id === undefined ? createUnboundIdentity() : options.id,
  ) as unknown as Id;
  validateErrorHttp(options.http);
  const retry = normalizeErrorRetry(options.retry);

  const ref = Object.freeze({ kind: "error" as const, id });
  const http =
    options.http === undefined ? undefined : Object.freeze({ status: options.http.status });
  const makeError = (
    input: InferInput<DataSchema>,
  ): {
    readonly data: InferOutput<DataSchema>;
    readonly message: string;
  } => {
    const result = validateSync(options.data, input);
    if (!("value" in result)) throw new TypeError(`Invalid data for declared error "${id}"`);
    const data = deepFreeze(result.value);
    const message = typeof options.message === "function" ? options.message(data) : options.message;
    if (typeof message !== "string")
      throw new TypeError(`Error message for "${id}" must be a string`);
    return { data, message };
  };

  class DefinedError extends DeclaredError<Id, InferOutput<DataSchema>> {
    constructor(input: InferInput<DataSchema>) {
      const error = makeError(input);
      const boundId = getDescriptorIdentity(DefinedError);
      const boundRef = Object.freeze({ kind: "error" as const, id: boundId });
      super(
        boundId as Id,
        boundRef as ErrorRef<Id>,
        error.data,
        error.message,
        retry.retry,
        retry.afterMs,
        http,
      );
    }
  }

  Object.defineProperty(DefinedError, "name", { value: id });
  const descriptor = deepFreeze({
    kind: "error" as const,
    id,
    ref,
    data: options.data,
    message: options.message,
    retry: retry.retry,
    ...(retry.afterMs === undefined ? {} : { afterMs: retry.afterMs }),
    ...(http === undefined ? {} : { http }),
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.tags === undefined ? {} : { tags: Object.freeze([...options.tags]) }),
    create: (input: InferInput<DataSchema>): DeclaredError<Id, InferOutput<DataSchema>> =>
      new DefinedError(input),
  });
  Object.assign(DefinedError, descriptor);
  Object.freeze(DefinedError.prototype);
  Object.freeze(DefinedError);
  return DefinedError as unknown as ErrorDescriptor<Id, InferOutput<DataSchema>, DataSchema>;
}
