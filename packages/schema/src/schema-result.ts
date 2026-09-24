import { Effect } from "effect";
import { runSchemaSync } from "./schema-observability.js";
import type {
  StandardFailure,
  StandardPathSegment,
  StandardResult,
  StandardSuccess,
} from "./standard-schema.types.js";

/**
 * Maps a synchronous or asynchronous validation result in Effect.
 * @param result - Result or promise to map.
 * @param map - Mapper for the resolved result.
 * @returns An Effect containing the mapped value or promise.
 * @example Effect.runSync(mapResultEffect({ value: 1 }, (result) => result));
 */
export function mapResultEffect<T, U>(
  result: StandardResult<T> | Promise<StandardResult<T>>,
  map: (value: StandardResult<T>) => U,
): Effect.Effect<U | Promise<U>> {
  return Effect.sync(() => (looksLikePromise(result) ? result.then(map) : map(result)));
}

/**
 * Maps a result without changing whether it is synchronous.
 * @param result - Result or promise to map.
 * @param map - Mapper for the resolved result.
 * @returns The mapped value or promise.
 * @example mapResult({ value: 1 }, (result) => result);
 */
export function mapResult<T, U>(
  result: StandardResult<T> | Promise<StandardResult<T>>,
  map: (value: StandardResult<T>) => U,
): U | Promise<U> {
  return runSchemaSync(mapResultEffect(result, map));
}

/**
 * Chains successful validation while retaining failures in Effect.
 * @param result - Initial result or promise.
 * @param map - Mapper for a valid output.
 * @returns An Effect containing the next result or promise.
 * @example Effect.runSync(flatMapResultEffect({ value: 1 }, (value) => ({ value })));
 */
export function flatMapResultEffect<T, U>(
  result: StandardResult<T> | Promise<StandardResult<T>>,
  map: (value: T) => StandardResult<U> | Promise<StandardResult<U>>,
): Effect.Effect<StandardResult<U> | Promise<StandardResult<U>>> {
  return Effect.sync(() => {
    if (looksLikePromise(result))
      return result.then((resolved) => (isFailure(resolved) ? resolved : map(resolved.value)));
    return isFailure(result) ? result : map(result.value);
  });
}

/**
 * Chains successful validation and preserves sync/async shape.
 * @param result - Initial result or promise.
 * @param map - Mapper for a valid output.
 * @returns The next result or promise.
 * @example flatMapResult({ value: 1 }, (value) => ({ value: value + 1 }));
 */
export function flatMapResult<T, U>(
  result: StandardResult<T> | Promise<StandardResult<T>>,
  map: (value: T) => StandardResult<U> | Promise<StandardResult<U>>,
): StandardResult<U> | Promise<StandardResult<U>> {
  return runSchemaSync(flatMapResultEffect(result, map));
}

/**
 * Maps a value or promise inside Effect.
 * @param value - Value or promise to map.
 * @param map - Mapper for the resolved value.
 * @returns An Effect containing the mapped value or promise.
 * @example Effect.runSync(mapValueEffect(1, (value) => value + 1));
 */
export function mapValueEffect<T, U>(
  value: T | Promise<T>,
  map: (value: T) => U,
): Effect.Effect<U | Promise<U>> {
  return Effect.sync(() => (looksLikePromise(value) ? value.then(map) : map(value)));
}

/**
 * Maps a value without changing whether it is synchronous.
 * @param value - Value or promise to map.
 * @param map - Mapper for the resolved value.
 * @returns The mapped value or promise.
 * @example mapValue(1, (value) => value + 1);
 */
export function mapValue<T, U>(value: T | Promise<T>, map: (value: T) => U): U | Promise<U> {
  return runSchemaSync(mapValueEffect(value, map));
}

/**
 * Detects thenable objects in Effect.
 * @param value - Value to inspect.
 * @returns An Effect containing whether the value is thenable.
 * @example Effect.runSync(isPromiseLikeEffect(Promise.resolve(1)));
 */
export function isPromiseLikeEffect(value: unknown): Effect.Effect<boolean> {
  return Effect.sync(() => looksLikePromise(value));
}

/**
 * Narrows a value to a promise-like object.
 * @param value - Value to inspect.
 * @returns Whether a callable then property exists.
 * @example isPromiseLike(Promise.resolve(1));
 */
export function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return runSchemaSync(isPromiseLikeEffect(value));
}

/**
 * Detects a failure result in Effect.
 * @param result - Result to inspect.
 * @returns An Effect containing whether issues are present.
 * @example Effect.runSync(isFailureEffect({ issues: [] }));
 */
export function isFailureEffect<T>(result: StandardResult<T>): Effect.Effect<boolean> {
  return Effect.sync(() => "issues" in result && result.issues !== undefined);
}

/**
 * Narrows a result to a validation failure.
 * @param result - Result to inspect.
 * @returns Whether structured issues are present.
 * @example isFailure({ issues: [{ message: "bad" }] });
 */
export function isFailure<T>(result: StandardResult<T>): result is StandardFailure {
  return runSchemaSync(isFailureEffect(result));
}

/**
 * Creates a success result in Effect.
 * @param value - Validated value.
 * @returns An Effect containing a success result.
 * @example Effect.runSync(successEffect("ready"));
 */
export function successEffect<T>(value: T): Effect.Effect<StandardSuccess<T>> {
  return Effect.succeed({ value });
}

/**
 * Creates a success result.
 * @param value - Validated value.
 * @returns A Standard Schema success result.
 * @example success("ready");
 */
export function success<T>(value: T): StandardSuccess<T> {
  return runSchemaSync(successEffect(value));
}

/**
 * Creates a failure result in Effect.
 * @param message - Human readable issue.
 * @param path - Path to invalid input.
 * @returns An Effect containing a failure result.
 * @example Effect.runSync(failureEffect("bad", ["name"]));
 */
export function failureEffect(
  message: string,
  path: readonly StandardPathSegment[],
): Effect.Effect<StandardFailure> {
  return Effect.sync(() => ({ issues: [{ message, path }] }));
}

/**
 * Creates a failure result.
 * @param message - Human readable issue.
 * @param path - Path to invalid input.
 * @returns A Standard Schema failure result.
 * @example failure("bad", ["name"]);
 */
export function failure(message: string, path: readonly StandardPathSegment[]): StandardFailure {
  return runSchemaSync(failureEffect(message, path));
}

function looksLikePromise(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}
