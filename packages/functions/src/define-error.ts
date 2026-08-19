import { deepFreeze, isStableId, normalizeId, type DescriptorMetadata } from "@zsys/contracts";
import {
  validateSync,
  type InferInput,
  type InferOutput,
  type StandardSchemaV1,
} from "@zsys/schema";

export type ErrorRetry = "never" | "later";

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
  readonly http?: ErrorHttpMapping;

  constructor(
    id: Id,
    ref: ErrorRef<Id>,
    data: Data,
    message: string,
    retry: ErrorRetry,
    http: ErrorHttpMapping | undefined,
  ) {
    super(message);
    this.name = "DeclaredError";
    this.id = id;
    this.ref = ref;
    this.data = data;
    this.retry = retry;
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
  readonly create: (input: InferInput<DataSchema>) => DeclaredError<Id, Data>;
}

export type ErrorDescriptorAny = ErrorDescriptor<string, any, StandardSchemaV1<any, any>>;

export interface DefineErrorOptions<
  Id extends string,
  DataSchema extends StandardSchemaV1,
> extends DescriptorMetadata {
  readonly id: Id;
  readonly data: DataSchema;
  readonly message: string | ((data: InferOutput<DataSchema>) => string);
  readonly http?: ErrorHttpMapping;
  readonly retry: ErrorRetry;
}

export function defineError<const Id extends string, const DataSchema extends StandardSchemaV1>(
  options: DefineErrorOptions<Id, DataSchema>,
): ErrorDescriptor<Id, InferOutput<DataSchema>, DataSchema> {
  assertSchema(options.data);
  if (typeof options.message !== "string" && typeof options.message !== "function") {
    throw new TypeError("Error message must be a string or function");
  }
  const id = normalizeId(options.id) as unknown as Id;
  validateHttp(options.http);
  if (options.retry !== "never" && options.retry !== "later") {
    throw new TypeError("Error retry must be never or later");
  }

  const ref = Object.freeze({ kind: "error" as const, id });
  const http =
    options.http === undefined ? undefined : Object.freeze({ status: options.http.status });
  const descriptor = {
    kind: "error" as const,
    id,
    ref,
    data: options.data,
    message: options.message,
    retry: options.retry,
    ...(http === undefined ? {} : { http }),
    ...(options.title === undefined ? {} : { title: options.title }),
    ...(options.description === undefined ? {} : { description: options.description }),
    ...(options.tags === undefined ? {} : { tags: Object.freeze([...options.tags]) }),
    create: (input: InferInput<DataSchema>): DeclaredError<Id, InferOutput<DataSchema>> => {
      const result = validateSync(options.data, input);
      if (!("value" in result)) throw new TypeError(`Invalid data for declared error "${id}"`);
      const data = deepFreeze(result.value);
      const message =
        typeof options.message === "function" ? options.message(data) : options.message;
      if (typeof message !== "string")
        throw new TypeError(`Error message for "${id}" must be a string`);
      return new DeclaredError(id, ref, data, message, options.retry, http);
    },
  };
  return deepFreeze(descriptor) as ErrorDescriptor<Id, InferOutput<DataSchema>, DataSchema>;
}

export function isErrorDescriptor(value: unknown): value is ErrorDescriptorAny {
  if (!isRecord(value)) return false;
  const ref = value.ref;
  return (
    value.kind === "error" &&
    isStableId(value.id) &&
    isRecord(ref) &&
    ref.kind === "error" &&
    ref.id === value.id &&
    Reflect.ownKeys(ref).length === 2 &&
    typeof value.create === "function"
  );
}

function validateHttp(http: ErrorHttpMapping | undefined): void {
  if (
    http !== undefined &&
    (!Number.isInteger(http.status) || http.status < 100 || http.status > 599)
  ) {
    throw new TypeError("Error HTTP status must be an integer from 100 through 599");
  }
}

function assertSchema(value: unknown): asserts value is StandardSchemaV1 {
  if (!isRecord(value))
    throw new TypeError("Declared error data must be a Standard Schema v1 validator");
  const standard = value["~standard"];
  if (!isRecord(standard) || standard.version !== 1 || typeof standard.validate !== "function") {
    throw new TypeError("Declared error data must be a Standard Schema v1 validator");
  }
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
