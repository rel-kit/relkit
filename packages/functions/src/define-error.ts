import { FunctionInputError } from "./function-input-error.js";
import { deepFreeze, normalizeId } from "@relkit/contracts";
import {
  createUnboundIdentity,
  getDescriptorIdentity,
  normalizeErrorRetryEffect,
  type ErrorRetry,
} from "@relkit/invocation";
import { Effect } from "effect";
import {
  validateSync,
  type InferInput,
  type InferOutput,
  type StandardSchemaV1,
} from "@relkit/schema";
import { assertErrorSchema, validateErrorHttp } from "./define-error-validation.js";
import {
  FunctionOperationError,
  functionAttempt,
  functionTry,
  observeFunction,
  runFunctionSync,
} from "./function-observability.js";
import type {
  DefineErrorOptions,
  ErrorDescriptor,
  ErrorHttpMapping,
  ErrorRef,
} from "./define-error.types.js";

export { isErrorDescriptor, isErrorDescriptorEffect } from "./define-error-validation.js";

export type { ErrorRetry, ErrorRetryInput, NormalizedErrorRetry } from "@relkit/invocation";
export type {
  DefineErrorOptions,
  ErrorDescriptor,
  ErrorDescriptorAny,
  ErrorHttpMapping,
  ErrorRef,
} from "./define-error.types.js";

/** Validated application error instance.
 * @example const error = new NotFound({ id: "one" });
 */
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

/**
 * Defines a typed application error with safe data, transport metadata, and an optional retry hint.
 * The compiler derives omitted IDs. Omitted retry means never; `later` only hints to durable work.
 *
 * @param options - Error schema, message, and retry metadata.
 * @returns Effect yielding the callable descriptor or a tagged validation failure.
 * @example
 * const NotFound = Effect.runSync(defineErrorEffect({
 *   id: "orders.not-found",
 *   data: z.object({ orderId: z.string() }),
 *   message: ({ orderId }) => `Order ${orderId} was not found`,
 * }));
 * new NotFound({ orderId: "order-1" });
 * @category Errors
 * @since 0.1.0
 */
export const defineErrorEffect = Effect.fn("functions.error.define")(
  <const Id extends string, const DataSchema extends StandardSchemaV1>(
    options: DefineErrorOptions<Id, DataSchema>,
  ): Effect.Effect<
    ErrorDescriptor<Id, InferOutput<DataSchema>, DataSchema>,
    import("./function-observability.js").FunctionOperationError
  > =>
    observeFunction(
      "error.define",
      Effect.gen(function* () {
        const id = yield* functionAttempt("error.define", () => {
          assertErrorSchema(options.data);
          if (typeof options.message !== "string" && typeof options.message !== "function")
            throw new FunctionInputError("Error message must be a string or function");
          const id = normalizeId(
            options.id === undefined ? createUnboundIdentity() : options.id,
          ) as unknown as Id;
          validateErrorHttp(options.http);
          return id;
        });
        const retry = yield* normalizeErrorRetryEffect(options.retry).pipe(
          Effect.mapError(
            (failure) =>
              new FunctionOperationError({
                operation: "error.define",
                reason: failure.message,
                cause: new TypeError(failure.message),
              }),
          ),
        );
        return yield* functionAttempt("error.define", () => {
          const ref = Object.freeze({ kind: "error" as const, id });
          const http =
            options.http === undefined ? undefined : Object.freeze({ status: options.http.status });
          const makeError = (
            input: InferInput<DataSchema>,
          ): {
            readonly data: InferOutput<DataSchema>;
            readonly message: string;
          } =>
            runFunctionSync(
              functionTry("error.create", () => {
                const result = validateSync(options.data, input);
                if (!("value" in result))
                  throw new FunctionInputError(`Invalid data for declared error "${id}"`);
                const data = deepFreeze(result.value);
                const message =
                  typeof options.message === "function" ? options.message(data) : options.message;
                if (typeof message !== "string")
                  throw new FunctionInputError(`Error message for "${id}" must be a string`);
                return { data, message };
              }),
            );

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
          return DefinedError as unknown as ErrorDescriptor<
            Id,
            InferOutput<DataSchema>,
            DataSchema
          >;
        });
      }),
    ),
);

/** Defines a typed application error.
 * @param options - Error schema, message, and transport metadata.
 * @returns Callable frozen error descriptor.
 * @throws TypeError for invalid schema, retry, HTTP status, or message.
 * @example const NotFound = defineError({ id: "orders.not-found", data: z.object({ id: z.string() }), message: "Missing" });
 */
export function defineError<const Id extends string, const DataSchema extends StandardSchemaV1>(
  options: DefineErrorOptions<Id, DataSchema>,
): ErrorDescriptor<Id, InferOutput<DataSchema>, DataSchema> {
  return runFunctionSync(defineErrorEffect(options));
}
