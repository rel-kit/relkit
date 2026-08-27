/** A Standard Schema v1 path may use a key directly or a structured segment. */
export type StandardPathSegment = PropertyKey | { readonly key: PropertyKey };

/** A portable validation issue. */
export interface StandardIssue {
  readonly message: string;
  readonly path?: readonly StandardPathSegment[];
}

/** The success result returned by a Standard Schema validator. */
export interface StandardSuccess<T> {
  readonly value: T;
  readonly issues?: undefined;
}

/** The failure result returned by a Standard Schema validator. */
export interface StandardFailure {
  readonly issues: readonly StandardIssue[];
}

/** A Standard Schema v1 validation result. */
export type StandardResult<T> = StandardSuccess<T> | StandardFailure;

/** Standard Schema v1 options accepted by compatible validators. */
export interface StandardSchemaOptions {
  readonly libraryOptions?: Record<string, unknown> | undefined;
}

/** Type-only input/output information advertised by Standard Schema. */
export interface StandardSchemaTypes<TInput = unknown, TOutput = TInput> {
  readonly input: TInput;
  readonly output: TOutput;
}

/** The Standard Schema v1 contract accepted by RelKit. */
export interface StandardSchemaV1<TInput = unknown, TOutput = TInput> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown,
      options?: StandardSchemaOptions,
    ) => StandardResult<TOutput> | Promise<StandardResult<TOutput>>;
    readonly types?: StandardSchemaTypes<TInput, TOutput>;
  };
}

export interface StandardJSONSchemaV1<TInput = unknown, TOutput = TInput> {
  readonly "~standard": StandardJSONSchemaV1.Props<TInput, TOutput>;
}

export namespace StandardJSONSchemaV1 {
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: StandardSchemaTypes<Input, Output>;
    readonly jsonSchema: {
      readonly input: (options: Options) => Record<string, unknown>;
      readonly output: (options: Options) => Record<string, unknown>;
    };
  }
  export interface Options {
    readonly target: "draft-2020-12" | "draft-07" | "openapi-3.0" | ({} & string);
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }
}

/** Namespace aliases matching the official Standard Schema v1 vocabulary. */
export namespace StandardSchemaV1 {
  export type Props<Input = unknown, Output = Input> = StandardSchemaV1<Input, Output>["~standard"];
  export type Result<Output> = StandardResult<Output>;
  export type SuccessResult<Output> = StandardSuccess<Output>;
  export type FailureResult = StandardFailure;
  export type Issue = StandardIssue;
  export type PathSegment = { readonly key: PropertyKey };
  export type Types<Input = unknown, Output = Input> = StandardSchemaTypes<Input, Output>;
  export type Options = StandardSchemaOptions;
  export type InferInput<S extends StandardSchemaV1> = import("./standard-schema.js").InferInput<S>;
  export type InferOutput<S extends StandardSchemaV1> =
    import("./standard-schema.js").InferOutput<S>;
}

/** RelKit's public schema boundary, including its future projection hook. */
export interface RelkitSchema<TInput = unknown, TOutput = TInput> extends StandardSchemaV1<
  TInput,
  TOutput
> {
  readonly "~standard": StandardSchemaV1<TInput, TOutput>["~standard"] &
    StandardJSONSchemaV1<TInput, TOutput>["~standard"];
  readonly relkit?: {
    readonly jsonSchema?: () => JsonValue;
  };
}

/** JSON-safe values used by the optional schema projection hook. */
export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/** Infers a schema's accepted input type. */
export type InferInput<S extends StandardSchemaV1> = S["~standard"] extends {
  readonly types?: infer Types;
}
  ? Types extends StandardSchemaTypes<infer Input, unknown>
    ? Input
    : unknown
  : unknown;

/** Infers a schema's validated output type. */
export type InferOutput<S extends StandardSchemaV1> = S["~standard"] extends {
  readonly types?: infer Types;
}
  ? Types extends StandardSchemaTypes<unknown, infer Output>
    ? Output
    : unknown
  : unknown;

/** A RelKit schema with familiar parsing and composition helpers. */
export interface Schema<TInput = unknown, TOutput = TInput> extends RelkitSchema<TInput, TOutput> {
  optional(): Schema<TInput | undefined, TOutput | undefined>;
  nullable(): Schema<TInput | null, TOutput | null>;
  default(value: TInput | (() => TInput)): Schema<TInput | undefined, TOutput>;
  transform<TNext>(transform: (value: TOutput) => TNext | Promise<TNext>): Schema<TInput, TNext>;
  refine(
    check: (value: TOutput) => boolean | Promise<boolean>,
    message?: string,
  ): Schema<TInput, TOutput>;
  parse(value: unknown): TOutput;
  parseAsync(value: unknown): Promise<TOutput>;
  safeParse(value: unknown): StandardResult<TOutput> | Promise<StandardResult<TOutput>>;
}

/**
 * Validates a value with any Standard Schema v1-compatible validator.
 *
 * @example
 * ```ts
 * import { validate, z } from "@relkit/schema"
 *
 * const result = await validate(z.string(), "ready")
 * if (!("value" in result)) throw new Error("validation failed")
 * ```
 * @category Validation
 * @since 0.1.0
 */
export function validate<S extends StandardSchemaV1>(
  schema: S,
  value: InferInput<S>,
): StandardResult<InferOutput<S>> | Promise<StandardResult<InferOutput<S>>> {
  assertStandardSchema(schema);
  return schema["~standard"].validate(value) as
    StandardResult<InferOutput<S>> | Promise<StandardResult<InferOutput<S>>>;
}

/** Validates synchronously and rejects schemas that require asynchronous work. */
export function validateSync<S extends StandardSchemaV1>(
  schema: S,
  value: InferInput<S>,
): StandardResult<InferOutput<S>> {
  const result = validate(schema, value);
  if (isPromiseLike(result)) throw new TypeError("Schema validation is asynchronous");
  return result;
}

export { SchemaValidationError, createSchema, runSchema } from "./schema-impl.js";

export function issue(message: string, path: readonly StandardPathSegment[]): StandardFailure {
  return { issues: [{ message, path }] };
}

function assertStandardSchema(schema: StandardSchemaV1): void {
  const standard = schema?.["~standard"];
  if (standard?.version !== 1 || typeof standard.validate !== "function") {
    throw new TypeError("Value is not a Standard Schema v1 validator");
  }
}

export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}
