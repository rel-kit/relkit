import type {
  StandardFailure,
  StandardPathSegment,
  StandardResult,
  StandardSuccess,
} from "./standard-schema.js";

export function mapResult<T, U>(
  result: StandardResult<T> | Promise<StandardResult<T>>,
  map: (value: StandardResult<T>) => U,
): U | Promise<U> {
  return isPromiseLike(result) ? result.then(map) : map(result);
}

export function flatMapResult<T, U>(
  result: StandardResult<T> | Promise<StandardResult<T>>,
  map: (value: T) => StandardResult<U> | Promise<StandardResult<U>>,
): StandardResult<U> | Promise<StandardResult<U>> {
  if (isPromiseLike(result))
    return result.then((resolved) => (isFailure(resolved) ? resolved : map(resolved.value)));
  return isFailure(result) ? result : map(result.value);
}

export function mapValue<T, U>(value: T | Promise<T>, map: (value: T) => U): U | Promise<U> {
  return isPromiseLike(value) ? value.then(map) : map(value);
}

export function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

export function isFailure<T>(result: StandardResult<T>): result is StandardFailure {
  return "issues" in result && result.issues !== undefined;
}

export function success<T>(value: T): StandardSuccess<T> {
  return { value };
}

export function failure(message: string, path: readonly StandardPathSegment[]): StandardFailure {
  return { issues: [{ message, path }] };
}
