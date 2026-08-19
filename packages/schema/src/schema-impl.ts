import type {
  JsonValue,
  Schema,
  StandardFailure,
  StandardPathSegment,
  StandardResult,
  StandardSchemaTypes,
  StandardSchemaV1,
  StandardSuccess,
} from "./standard-schema.js";
import {
  setSchemaMetadata,
  withDefaultMetadata,
  withNullableMetadata,
  withOptionalMetadata,
  type SchemaMetadata,
} from "./schema-metadata.js";

type Check<T> = (
  value: unknown,
  path: readonly StandardPathSegment[],
) => StandardResult<T> | Promise<StandardResult<T>>;

interface InternalSchema<TInput, TOutput> extends Schema<TInput, TOutput> {
  readonly _run: Check<TOutput>;
}

/** Error thrown by the familiar `parse` helper when validation fails. */
export class SchemaValidationError extends TypeError {
  readonly issues: StandardFailure["issues"];

  constructor(issues: StandardFailure["issues"]) {
    super("Schema validation failed");
    this.name = "SchemaValidationError";
    this.issues = issues;
  }
}

/** Creates a schema implementation without exposing its concrete class. */
export function createSchema<TInput, TOutput>(
  check: Check<TOutput>,
  metadata: SchemaMetadata = {},
): Schema<TInput, TOutput> {
  const schema = new SchemaImplementation<TInput, TOutput>(check, metadata);
  setSchemaMetadata(schema, metadata);
  return schema;
}

/** Runs either a ZSys schema or a third-party Standard Schema at a nested path. */
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
  readonly "~standard": StandardSchemaV1<TInput, TOutput>["~standard"];
  readonly zsys: { readonly jsonSchema?: () => JsonValue };

  constructor(check: Check<TOutput>, metadata: SchemaMetadata) {
    this._run = check;
    this.zsys = metadata.jsonSchema ? { jsonSchema: metadata.jsonSchema } : {};
    this["~standard"] = {
      version: 1,
      vendor: "zsys",
      types: undefined as unknown as StandardSchemaTypes<TInput, TOutput>,
      validate: (value, options) => {
        void options;
        return check(value, []);
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
    return createSchema((value, path) =>
      flatMapResult(this._run(value, path), (result) =>
        mapValue(transform(result), (output) => success(output)),
      ),
    );
  }

  refine(
    check: (value: TOutput) => boolean | Promise<boolean>,
    message = "Invalid value",
  ): Schema<TInput, TOutput> {
    return createSchema((value, path) =>
      flatMapResult(this._run(value, path), (result) =>
        mapValue(check(result), (valid) => (valid ? success(result) : failure(message, path))),
      ),
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

function mapResult<T, U>(
  result: StandardResult<T> | Promise<StandardResult<T>>,
  map: (value: StandardResult<T>) => U,
): U | Promise<U> {
  return isPromiseLike(result) ? result.then(map) : map(result);
}

function flatMapResult<T, U>(
  result: StandardResult<T> | Promise<StandardResult<T>>,
  map: (value: T) => StandardResult<U> | Promise<StandardResult<U>>,
): StandardResult<U> | Promise<StandardResult<U>> {
  if (isPromiseLike(result)) {
    return result.then((resolved) => (isFailure(resolved) ? resolved : map(resolved.value)));
  }
  return isFailure(result) ? result : map(result.value);
}

function mapValue<T, U>(value: T | Promise<T>, map: (value: T) => U): U | Promise<U> {
  return isPromiseLike(value) ? value.then(map) : map(value);
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

function isFailure<T>(result: StandardResult<T>): result is StandardFailure {
  return "issues" in result && result.issues !== undefined;
}

function success<T>(value: T): StandardSuccess<T> {
  return { value };
}

function failure(message: string, path: readonly StandardPathSegment[]): StandardFailure {
  return { issues: [{ message, path }] };
}

function unwrap<T>(result: StandardResult<T>): T {
  if (isFailure(result)) throw new SchemaValidationError(result.issues);
  return result.value;
}

function unwrapSync<T>(result: StandardResult<T> | Promise<StandardResult<T>>): T {
  if (isPromiseLike(result)) throw new TypeError("Schema validation is asynchronous");
  return unwrap(result);
}
