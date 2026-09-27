import { Effect, Result, Schema } from "effect";
import { assertBoundedString } from "./task-policy-validation.js";
import { observeJobs } from "./jobs-observability.js";

/** An invalid task authoring helper input.
 * @example new TaskSupportError({ reason: "Task tags must be unique" });
 */
export class TaskSupportError extends Schema.TaggedError<TaskSupportError>()(
  "Jobs.TaskSupportError",
  { reason: Schema.String },
) {}

/** Copies unique, bounded authoring strings in Effect.
 * @param value - Untrusted string collection.
 * @param name - Field name for diagnostics.
 * @returns A frozen string array, undefined, or TaskSupportError.
 * @example Effect.runPromise(copyStringsEffect(["red"], "tags"));
 */
export const copyStringsEffect = Effect.fn("Jobs.copyStrings")(
  function* (value: unknown, name: string) {
    if (value === undefined) return undefined;
    if (!Array.isArray(value))
      return yield* Effect.fail(
        new TaskSupportError({
          reason: `Task ${name} must be an array of non-empty strings`,
        }),
      );
    const strings = yield* Effect.forEach(value, (entry) =>
      Effect.try({
        try: () => {
          if (typeof entry !== "string" || entry.length === 0)
            throw new TypeError(`Task ${name} must be an array of non-empty strings`);
          assertBoundedString(entry, `Task ${name} entry`);
          return entry;
        },
        catch: (cause) =>
          new TaskSupportError({
            reason: cause instanceof Error ? cause.message : String(cause),
          }),
      }),
    );
    if (new Set(strings).size !== strings.length)
      return yield* Effect.fail(new TaskSupportError({ reason: `Task ${name} must be unique` }));
    return Object.freeze(strings);
  },
  (effect) => observeJobs("taskSupport.copyStrings", effect),
);

/** Synchronous authoring string adapter.
 * @param value - Untrusted string collection.
 * @param name - Field name for diagnostics.
 * @returns A frozen string array or undefined.
 * @throws TypeError for invalid or duplicate strings.
 * @example copyStrings(["red"], "tags");
 */
export function copyStrings(value: unknown, name: string): readonly string[] | undefined {
  const result = Effect.runSync(Effect.result(copyStringsEffect(value, name)));
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
  return result.success;
}

/** Validates an optional lifecycle hook in Effect.
 * @param value - Candidate hook.
 * @param name - Field name for diagnostics.
 * @returns An Effect of void or TaskSupportError.
 * @example Effect.runPromise(assertHookEffect(() => {}, "onStart"));
 */
export const assertHookEffect = Effect.fn("Jobs.assertHook")(
  function* (value: unknown, name: string) {
    if (value !== undefined && typeof value !== "function")
      return yield* Effect.fail(
        new TaskSupportError({ reason: `Task ${name} must be a function` }),
      );
  },
  (effect) => observeJobs("taskSupport.assertHook", effect),
);

/** Synchronous optional hook assertion.
 * @param value - Candidate hook.
 * @param name - Field name for diagnostics.
 * @returns Nothing when valid.
 * @throws TypeError when the hook is not a function.
 * @example assertHook(() => {}, "onStart");
 */
export function assertHook(value: unknown, name: string): void {
  const result = Effect.runSync(Effect.result(assertHookEffect(value, name)));
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
}

/** Detects a Standard Schema v1 value in Effect.
 * @param value - Untrusted candidate.
 * @returns An Effect of a boolean with no typed failure.
 * @example Effect.runSync(isSchemaEffect({ "~standard": { version: 1, validate() {} } }));
 */
export const isSchemaEffect = Effect.fn("Jobs.isSchema")(
  function* (value: unknown) {
    if (!(yield* isRecordEffect(value))) return false;
    const outer = value as Record<PropertyKey, unknown>;
    const standard = outer["~standard"];
    if (!(yield* isRecordEffect(standard))) return false;
    const schema = standard as Record<PropertyKey, unknown>;
    return schema.version === 1 && typeof schema.validate === "function";
  },
  (effect) => observeJobs("taskSupport.isSchema", effect),
);

/** Synchronous Standard Schema v1 predicate.
 * @param value - Untrusted candidate.
 * @returns Whether it exposes a Standard Schema v1 validator.
 * @throws A runtime defect if the Effect cannot execute synchronously.
 * @example isSchema({ "~standard": { version: 1, validate() {} } });
 */
export function isSchema(value: unknown): boolean {
  return Effect.runSync(isSchemaEffect(value));
}

/** Checks property ownership in Effect.
 * @param value - Object to inspect.
 * @param key - Own property key.
 * @returns An Effect of a boolean with no typed failure.
 * @example Effect.runSync(hasOwnEffect({ id: 1 }, "id"));
 */
export const hasOwnEffect = Effect.fn("Jobs.hasOwn")(
  function* (value: object, key: PropertyKey) {
    return Object.prototype.hasOwnProperty.call(value, key);
  },
  (effect) => observeJobs("taskSupport.hasOwn", effect),
);

/** Synchronous own-property predicate.
 * @param value - Object to inspect.
 * @param key - Own property key.
 * @returns Whether the key belongs to the object.
 * @throws A runtime defect if the Effect cannot execute synchronously.
 * @example hasOwn({ id: 1 }, "id");
 */
export function hasOwn(value: object, key: PropertyKey): boolean {
  return Effect.runSync(hasOwnEffect(value, key));
}

/** Tests for a non-array record in Effect.
 * @param value - Untrusted candidate.
 * @returns An Effect of a boolean with no typed failure.
 * @example Effect.runSync(isRecordEffect({ id: 1 }));
 */
export const isRecordEffect = Effect.fn("Jobs.isRecord")(
  function* (value: unknown) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  },
  (effect) => observeJobs("taskSupport.isRecord", effect),
);

/** Synchronous non-array record predicate.
 * @param value - Untrusted candidate.
 * @returns Whether the value is a record.
 * @throws A runtime defect if the Effect cannot execute synchronously.
 * @example isRecord({ id: 1 });
 */
export function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return Effect.runSync(isRecordEffect(value));
}
