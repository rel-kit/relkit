/**
 * A Standard Schema issue path accepts keys and structured segments.
 * @example const path: StandardPathSegment[] = ["items", 0, { key: "name" }];
 */
export type StandardPathSegment = PropertyKey | { readonly key: PropertyKey };

/**
 * A portable issue that may identify a nested path.
 * @example const issue: StandardIssue = { message: "Required", path: ["name"] };
 */
export interface StandardIssue {
  readonly message: string;
  readonly path?: readonly StandardPathSegment[];
}

/**
 * Successful Standard Schema validation with a typed output.
 * @example const success: StandardSuccess<string> = { value: "ready" };
 */
export interface StandardSuccess<T> {
  readonly value: T;
  readonly issues?: undefined;
}

/**
 * Standard Schema validation failure with structured issues.
 * @example const failure: StandardFailure = { issues: [{ message: "Required" }] };
 */
export interface StandardFailure {
  readonly issues: readonly StandardIssue[];
}

/**
 * Result union that preserves issues instead of throwing.
 * @example const result: StandardResult<number> = { value: 2 };
 */
export type StandardResult<T> = StandardSuccess<T> | StandardFailure;

/**
 * Vendor-specific options accepted by a compatible validator.
 * @example const options: StandardSchemaOptions = { libraryOptions: {} };
 */
export interface StandardSchemaOptions {
  readonly libraryOptions?: Record<string, unknown> | undefined;
}

/**
 * Phantom input and output types advertised by Standard Schema.
 * @example type Types = StandardSchemaTypes<string, number>;
 */
export interface StandardSchemaTypes<TInput = unknown, TOutput = TInput> {
  readonly input: TInput;
  readonly output: TOutput;
}

/**
 * Standard Schema v1 contract accepted by RELKIT.
 * The validate hook may return synchronously or asynchronously.
 * @example const result = await schema["~standard"].validate(value);
 */
export interface StandardSchemaV1<TInput = unknown, TOutput = TInput> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    /**
     * Validates unknown input.
     * @param value - Candidate input.
     * @param options - Optional vendor settings.
     * @returns A validation result or promise of one.
     * @example schema["~standard"].validate("ready");
     */
    readonly validate: (
      value: unknown,
      options?: StandardSchemaOptions,
    ) => StandardResult<TOutput> | Promise<StandardResult<TOutput>>;
    readonly types?: StandardSchemaTypes<TInput, TOutput>;
  };
}

/**
 * Standard JSON Schema v1 projection contract.
 * @example schema["~standard"].jsonSchema.input({ target: "draft-2020-12" });
 */
export interface StandardJSONSchemaV1<TInput = unknown, TOutput = TInput> {
  readonly "~standard": StandardJSONSchemaV1.Props<TInput, TOutput>;
}

export namespace StandardJSONSchemaV1 {
  /**
   * Type and projection hooks advertised by a schema.
   * @example const props: StandardJSONSchemaV1.Props = schema["~standard"];
   */
  export interface Props<Input = unknown, Output = Input> {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: StandardSchemaTypes<Input, Output>;
    readonly jsonSchema: {
      readonly input: (options: Options) => Record<string, unknown>;
      readonly output: (options: Options) => Record<string, unknown>;
    };
  }
  /**
   * Dialect and vendor options for Standard JSON Schema hooks.
   * @example const options: StandardJSONSchemaV1.Options = { target: "draft-2020-12" };
   */
  export interface Options {
    readonly target: "draft-2020-12" | "draft-07" | "openapi-3.0" | ({} & string);
    readonly libraryOptions?: Record<string, unknown> | undefined;
  }
}

/**
 * Namespace aliases matching the official Standard Schema v1 vocabulary.
 * @example type Result = StandardSchemaV1.Result<string>;
 */
export namespace StandardSchemaV1 {
  export type Props<Input = unknown, Output = Input> = StandardSchemaV1<Input, Output>["~standard"];
  export type Result<Output> = StandardResult<Output>;
  export type SuccessResult<Output> = StandardSuccess<Output>;
  export type FailureResult = StandardFailure;
  export type Issue = StandardIssue;
  export type PathSegment = { readonly key: PropertyKey };
  export type Types<Input = unknown, Output = Input> = StandardSchemaTypes<Input, Output>;
  export type Options = StandardSchemaOptions;
  export type InferInput<S extends StandardSchemaV1> =
    import("./standard-schema.types.js").InferInput<S>;
  export type InferOutput<S extends StandardSchemaV1> =
    import("./standard-schema.types.js").InferOutput<S>;
}

/**
 * RELKIT schema boundary with optional legacy and directional projections.
 * @example const schema: RelkitSchema = z.string();
 */
export interface RelkitSchema<TInput = unknown, TOutput = TInput> extends StandardSchemaV1<
  TInput,
  TOutput
> {
  readonly "~standard": StandardSchemaV1<TInput, TOutput>["~standard"] &
    StandardJSONSchemaV1<TInput, TOutput>["~standard"];
  readonly relkit?: {
    readonly jsonSchema?: () => JsonValue;
    readonly inputJsonSchema?: () => JsonValue;
    readonly outputJsonSchema?: () => JsonValue;
  };
}

/**
 * JSON-safe value produced by a schema projection hook.
 * @example const projection: JsonValue = { type: "string" };
 */
export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

/**
 * Infers the accepted input type of a compatible schema.
 * @example type Input = InferInput<typeof schema>;
 */
export type InferInput<S extends StandardSchemaV1> = S["~standard"] extends {
  readonly types?: infer Types;
}
  ? Types extends StandardSchemaTypes<infer Input, unknown>
    ? Input
    : unknown
  : unknown;

/**
 * Infers the validated output type of a compatible schema.
 * @example type Output = InferOutput<typeof schema>;
 */
export type InferOutput<S extends StandardSchemaV1> = S["~standard"] extends {
  readonly types?: infer Types;
}
  ? Types extends StandardSchemaTypes<unknown, infer Output>
    ? Output
    : unknown
  : unknown;

export type { Schema } from "./schema-implementation.types.js";
