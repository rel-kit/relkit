import type {
  JsonValue,
  Schema,
  StandardFailure,
  StandardPathSegment,
  StandardResult,
  StandardSchemaTypes,
  StandardSchemaV1,
  StandardJSONSchemaV1,
  StandardSuccess,
} from "./standard-schema.js";
import {
  getSchemaMetadata,
  setSchemaMetadata,
  withDefaultMetadata,
  withNullableMetadata,
  withOptionalMetadata,
  withRefinementMetadata,
  withTransformMetadata,
  getMetadataProjection,
  type SchemaMetadata,
} from "./schema-metadata.js";
import {
  failure,
  flatMapResult,
  isFailure,
  isPromiseLike,
  mapResult,
  mapValue,
  success,
} from "./schema-result.js";
type Check<T> = (
  value: unknown,
  path: readonly StandardPathSegment[],
) => StandardResult<T> | Promise<StandardResult<T>>;
interface InternalSchema<TInput, TOutput> extends Schema<TInput, TOutput> {
  readonly _run: Check<TOutput>;
}
export class SchemaValidationError extends TypeError {
  readonly issues: StandardFailure["issues"];
  constructor(issues: StandardFailure["issues"]) {
    super("Schema validation failed");
    this.name = "SchemaValidationError";
    this.issues = issues;
  }
}
export function createSchema<TInput, TOutput>(
  check: Check<TOutput>,
  metadata: SchemaMetadata = {},
): Schema<TInput, TOutput> {
  const schema = new SchemaImplementation<TInput, TOutput>(check, metadata);
  setSchemaMetadata(schema, metadata);
  return schema;
}
export function runSchema<TOutput>(
  schema: StandardSchemaV1<unknown, TOutput>,
  value: unknown,
  path: readonly StandardPathSegment[] = [],
): StandardResult<TOutput> | Promise<StandardResult<TOutput>> {
  const internal = schema as Partial<InternalSchema<unknown, TOutput>>;
  if (typeof internal._run === "function") return internal._run(value, path);
  return addPath(schema["~standard"].validate(value), path);
}
class SchemaImplementation<TInput, TOutput> implements InternalSchema<TInput, TOutput> {
  readonly _run: Check<TOutput>;
  readonly "~standard": StandardSchemaV1<TInput, TOutput>["~standard"] &
    StandardJSONSchemaV1<TInput, TOutput>["~standard"];
  readonly relkit: {
    readonly jsonSchema?: () => JsonValue;
    readonly inputJsonSchema?: () => JsonValue;
    readonly outputJsonSchema?: () => JsonValue;
  };
  constructor(check: Check<TOutput>, metadata: SchemaMetadata) {
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
  optional(): Schema<TInput | undefined, TOutput | undefined> {
    return createSchema(
      (value, path) => (value === undefined ? success(value) : this._run(value, path)),
      withOptionalMetadata(this),
    );
  }
  nullable(): Schema<TInput | null, TOutput | null> {
    return createSchema(
      (value, path) => (value === null ? success(value) : this._run(value, path)),
      withNullableMetadata(this),
    );
  }
  default(value: TInput | (() => TInput)): Schema<TInput | undefined, TOutput> {
    return createSchema(
      (input, path) =>
        input === undefined
          ? this._run(typeof value === "function" ? (value as () => TInput)() : value, path)
          : this._run(input, path),
      withDefaultMetadata(this, value),
    );
  }
  transform<TNext>(transform: (value: TOutput) => TNext | Promise<TNext>): Schema<TInput, TNext> {
    return createSchema(
      (value, path) =>
        flatMapResult(this._run(value, path), (result) =>
          mapValue(transform(result), (output) => success(output)),
        ),
      withTransformMetadata(this),
    );
  }
  refine(
    check: (value: TOutput) => boolean | Promise<boolean>,
    message = "Invalid value",
  ): Schema<TInput, TOutput> {
    return createSchema(
      (value, path) =>
        flatMapResult(this._run(value, path), (result) =>
          mapValue(check(result), (valid) => (valid ? success(result) : failure(message, path))),
        ),
      withRefinementMetadata(this),
    );
  }
  parse(value: unknown): TOutput {
    return unwrapSync(this._run(value, []));
  }
  async parseAsync(value: unknown): Promise<TOutput> {
    return unwrap(await Promise.resolve(this._run(value, [])));
  }
  safeParse(value: unknown): StandardResult<TOutput> | Promise<StandardResult<TOutput>> {
    return this._run(value, []);
  }
}
function projectJsonSchema(
  metadata: SchemaMetadata,
  direction: "input" | "output",
  target: StandardJSONSchemaV1.Options["target"],
): Record<string, unknown> {
  if (target !== "draft-2020-12" && target !== "draft-07" && target !== "openapi-3.0") {
    throw new TypeError(`Unsupported JSON Schema target "${target}"`);
  }
  const value = getMetadataProjection(metadata, direction)?.();
  if (value === undefined || value === null || Array.isArray(value) || typeof value !== "object") {
    throw new TypeError("Schema does not expose a deterministic JSON Schema projection");
  }
  return value as Record<string, unknown>;
}
function addPath<T>(
  result: StandardResult<T> | Promise<StandardResult<T>>,
  path: readonly StandardPathSegment[],
): StandardResult<T> | Promise<StandardResult<T>> {
  return mapResult(result, (resolved) => {
    if (!isFailure(resolved) || path.length === 0) return resolved;
    return {
      issues: resolved.issues.map((issue) => ({
        ...issue,
        path: [...path, ...(issue.path ?? [])],
      })),
    };
  });
}
function unwrap<T>(result: StandardResult<T>): T {
  if (isFailure(result)) throw new SchemaValidationError(result.issues);
  return result.value;
}
function unwrapSync<T>(result: StandardResult<T> | Promise<StandardResult<T>>): T {
  if (isPromiseLike(result)) throw new TypeError("Schema validation is asynchronous");
  return unwrap(result);
}
