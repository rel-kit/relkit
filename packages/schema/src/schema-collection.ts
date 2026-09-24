import { Cause, Effect, Exit } from "effect";
import { isPromiseLike } from "./schema-result.js";
import { SchemaExecutionError } from "./standard-schema-effect.js";
import { issue } from "./standard-schema.js";
import type { SchemaTask } from "./schema-collection.types.js";
import type { StandardPathSegment, StandardResult } from "./standard-schema.types.js";

const MAX_CONCURRENT_VALIDATIONS = 8;

/**
 * Resolves child validators in input order with bounded async concurrency.
 * @param tasks - Deferred child validators.
 * @returns Ordered results, or SchemaExecutionError for a rejected validator.
 * @example Effect.runPromise(resolveTasksEffect([() => Promise.resolve({ value: 1 })]));
 */
export function resolveTasksEffect<T>(
  tasks: readonly SchemaTask<T>[],
): Effect.Effect<readonly StandardResult<T>[], SchemaExecutionError> {
  return Effect.flatMap(
    Effect.forEach(
      tasks,
      (task) =>
        Effect.exit(
          Effect.tryPromise({
            try: () => Promise.resolve(task()),
            catch: (cause) => new SchemaExecutionError({ cause }),
          }),
        ),
      { concurrency: MAX_CONCURRENT_VALIDATIONS },
    ),
    (exits) => {
      const failed = exits.find(Exit.isFailure);
      if (failed !== undefined) {
        const error = Cause.squash(failed.cause);
        return Effect.fail(
          error instanceof SchemaExecutionError
            ? error
            : new SchemaExecutionError({ cause: error }),
        );
      }
      return Effect.succeed(exits.map((exit) => (exit as Exit.Success<StandardResult<T>>).value));
    },
  );
}

/**
 * Collects object or array validation results and preserves issue order.
 * @param tasks - Deferred child validators.
 * @param map - Maps ordered successful outputs to a parent value.
 * @returns A synchronous result when possible, otherwise a promise.
 * @throws The first rejected child validator in input order.
 * @example collectResults([() => ({ value: 1 })], ([value]) => value);
 */
export function collectResults<T, U>(
  tasks: readonly SchemaTask<T>[],
  map: (values: T[]) => U,
): StandardResult<U> | Promise<StandardResult<U>> {
  const results = startTasks(tasks);
  return isPromiseLike(results)
    ? Promise.resolve(results).then((items) => collectValues(items, map))
    : collectValues(results, map);
}

/**
 * Selects the first successful union member in declaration order.
 * @param tasks - Deferred union member validators.
 * @param path - Path for a union mismatch issue.
 * @returns A synchronous result when possible, otherwise a promise.
 * @throws The first rejected validator in input order.
 * @example collectUnion([() => ({ value: "ok" })], []);
 */
export function collectUnion<T>(
  tasks: readonly SchemaTask<T>[],
  path: readonly StandardPathSegment[],
): StandardResult<T> | Promise<StandardResult<T>> {
  const results = startTasks(tasks);
  const select = (items: readonly StandardResult<T>[]): StandardResult<T> =>
    items.find(isSuccess) ?? issue("Value did not match any union member", path);
  return isPromiseLike(results) ? Promise.resolve(results).then(select) : select(results);
}

function startTasks<T>(
  tasks: readonly SchemaTask<T>[],
): readonly StandardResult<T>[] | Promise<readonly StandardResult<T>[]> {
  const completed: StandardResult<T>[] = [];
  for (let index = 0; index < tasks.length; index += 1) {
    const result = tasks[index]!();
    if (isPromiseLike(result)) {
      const pending: SchemaTask<T>[] = [() => Promise.resolve(result), ...tasks.slice(index + 1)];
      return Effect.runPromise(resolveTasksEffect(pending))
        .then((remaining) => [...completed, ...remaining])
        .catch((error) => {
          if (error instanceof SchemaExecutionError) throw error.cause;
          throw error;
        });
    }
    completed.push(result);
  }
  return completed;
}

function collectValues<T, U>(
  results: readonly StandardResult<T>[],
  map: (values: T[]) => U,
): StandardResult<U> {
  const issues = results.flatMap((result) => (isSuccess(result) ? [] : result.issues));
  if (issues.length > 0) return { issues };
  return { value: map(results.map((result) => (result as { value: T }).value)) };
}

function isSuccess<T>(result: StandardResult<T>): result is { readonly value: T } {
  return !("issues" in result) || result.issues === undefined;
}
