import type { DescriptorMetadata } from "@relkit/contracts";
import type { ErrorRetryInput, ErrorRetry } from "@relkit/invocation";
import type { InferInput, InferOutput, StandardSchemaV1 } from "@relkit/schema";
import type { DeclaredError } from "./define-error.js";

/** HTTP mapping for a declared error.
 * @example const http: ErrorHttpMapping = { status: 404 };
 */
export interface ErrorHttpMapping {
  readonly status: number;
}

/** Stable reference to an application error.
 * @example const ref: ErrorRef = { kind: "error", id: "orders.not-found" };
 */
export interface ErrorRef<Id extends string = string> {
  readonly kind: "error";
  readonly id: Id;
}

/** Callable descriptor for creating a declared error.
 * @example const error = new NotFound({ id: "one" });
 */
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

/** Any declared error descriptor for heterogeneous collections. */
export type ErrorDescriptorAny = ErrorDescriptor<string, any, StandardSchemaV1<any, any>>;

/** Options for constructing a declared error descriptor.
 * @example defineError({ id: "orders.not-found", data: z.object({ id: z.string() }), message: "Missing" });
 */
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
