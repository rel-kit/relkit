import { Effect } from "effect";
import { buildSchema } from "./builder-effect.js";
import { createSchema } from "./schema-impl.js";
import { projectJsonSchema } from "./schema-impl-helpers.js";
import { parseSchemaAsync, parseSchemaSync, safeParseSchema } from "./schema-parse.js";
import { throwCause } from "./schema-execution.js";
import { runSchemaSync } from "./schema-observability.js";
import {
  getSchemaMetadata,
  withDefaultMetadata,
  withNullableMetadata,
  withOptionalMetadata,
  withRefinementMetadata,
  withTransformMetadata,
} from "./schema-metadata.js";
import { failure, flatMapResult, mapValue, success } from "./schema-result.js";
import { SchemaExecutionError } from "./standard-schema-effect.js";
import type { InternalSchema, SchemaCheck } from "./schema-impl.types.js";
import type { SchemaMetadata } from "./schema-metadata.types.js";
import type { SchemaProjectionHooks } from "./schema-implementation.types.js";
import type {
  Schema,
  StandardJSONSchemaV1,
  StandardResult,
  StandardSchemaTypes,
  StandardSchemaV1,
} from "./standard-schema.types.js";

/**
 * Internal path-aware schema with Standard Schema and JSON Schema hooks.
 * @example new SchemaImplementation((value) => ({ value }), {});
 */
export class SchemaImplementation<TInput, TOutput> implements InternalSchema<TInput, TOutput> {
  readonly _run: SchemaCheck<TOutput>;
  readonly "~standard": StandardSchemaV1<TInput, TOutput>["~standard"] &
    StandardJSONSchemaV1<TInput, TOutput>["~standard"];
  readonly relkit: SchemaProjectionHooks;

  /**
   * Creates a schema with a path-aware check and projection metadata.
   * @param check - Child validation callback.
   * @param metadata - Projection and refinement metadata.
   * @example new SchemaImplementation((value) => ({ value }), {});
   */
  constructor(check: SchemaCheck<TOutput>, metadata: SchemaMetadata) {
    const originalCheck = check;
    check = (value, path) => {
      try {
        return runSchemaSync(
          Effect.try({
            try: () => originalCheck(value, path),
            catch: (cause) => new SchemaExecutionError({ cause }),
          }),
        );
      } catch (error) {
        throwCause(error);
      }
    };
    this._run = check;
    this.relkit = {
      ...(metadata.jsonSchema === undefined ? {} : { jsonSchema: metadata.jsonSchema }),
      ...(metadata.inputJsonSchema === undefined
        ? {}
        : { inputJsonSchema: metadata.inputJsonSchema }),
      ...(metadata.outputJsonSchema === undefined
        ? {}
        : { outputJsonSchema: metadata.outputJsonSchema }),
    };
    this["~standard"] = {
      version: 1,
      vendor: "relkit",
      types: undefined as unknown as StandardSchemaTypes<TInput, TOutput>,
      validate: (value, options) => {
        void options;
        return check(value, []);
      },
      jsonSchema: {
        input: (options) =>
          projectJsonSchema(getSchemaMetadata(this) ?? metadata, "input", options.target),
        output: (options) =>
          projectJsonSchema(getSchemaMetadata(this) ?? metadata, "output", options.target),
      },
    };
  }
  /**
   * Accepts an omitted or undefined value.
   * @returns A schema with optional input and output.
   * @example z.string().optional();
   */
  optional(): Schema<TInput | undefined, TOutput | undefined> {
    return buildSchema("schema.optional", () =>
      createSchema(
        (value, path) => (value === undefined ? success(value) : this._run(value, path)),
        withOptionalMetadata(this),
      ),
    );
  }
  /**
   * Accepts null without changing other validation.
   * @returns A nullable schema.
   * @example z.string().nullable();
   */
  nullable(): Schema<TInput | null, TOutput | null> {
    return buildSchema("schema.nullable", () =>
      createSchema(
        (value, path) => (value === null ? success(value) : this._run(value, path)),
        withNullableMetadata(this),
      ),
    );
  }
  /**
   * Substitutes a value when input is undefined.
   * @param value - Constant or lazy default value.
   * @returns A schema with optional input and required output.
   * @example z.string().default("pending");
   */
  default(value: TInput | (() => TInput)): Schema<TInput | undefined, TOutput> {
    return buildSchema("schema.default", () =>
      createSchema(
        (input, path) =>
          input === undefined
            ? this._run(typeof value === "function" ? (value as () => TInput)() : value, path)
            : this._run(input, path),
        withDefaultMetadata(this, value),
      ),
    );
  }
  /**
   * Maps a validated value to a new output.
   * @param transform - Synchronous or asynchronous output mapper.
   * @returns A schema with the transformed output type.
   * @example z.string().transform(Number);
   */
  transform<TNext>(transform: (value: TOutput) => TNext | Promise<TNext>): Schema<TInput, TNext> {
    return buildSchema("schema.transform", () =>
      createSchema(
        (value, path) =>
          flatMapResult(this._run(value, path), (result) =>
            mapValue(transform(result), (output) => success(output)),
          ),
        withTransformMetadata(this),
      ),
    );
  }

  /**
   * Adds a check after base validation succeeds.
   * @param check - Predicate for validated output.
   * @param message - Issue text when the predicate fails.
   * @returns A refined schema.
   * @example z.number().refine((value) => value > 0);
   */
  refine(
    check: (value: TOutput) => boolean | Promise<boolean>,
    message = "Invalid value",
  ): Schema<TInput, TOutput> {
    return buildSchema("schema.refine", () =>
      createSchema(
        (value, path) =>
          flatMapResult(this._run(value, path), (result) =>
            mapValue(check(result), (valid) => (valid ? success(result) : failure(message, path))),
          ),
        withRefinementMetadata(this),
      ),
    );
  }

  /**
   * Parses one input synchronously.
   * @param value - Input to parse.
   * @returns Validated output.
   * @throws SchemaValidationError or TypeError for invalid or asynchronous input.
   * @example z.string().parse("ready");
   */
  parse(value: unknown): TOutput {
    return parseSchemaSync(() => this._run(value, []));
  }

  /**
   * Parses one input and awaits asynchronous checks.
   * @param value - Input to parse.
   * @returns A promise of validated output.
   * @throws SchemaValidationError when validation fails.
   * @example await z.string().parseAsync("ready");
   */
  async parseAsync(value: unknown): Promise<TOutput> {
    return parseSchemaAsync(() => this._run(value, []));
  }

  /**
   * Returns issues instead of throwing for invalid input.
   * @param value - Input to validate.
   * @returns A result or promise matching validator behavior.
   * @example z.string().safeParse("ready");
   */
  safeParse(value: unknown): StandardResult<TOutput> | Promise<StandardResult<TOutput>> {
    return safeParseSchema(() => this._run(value, []));
  }
}
