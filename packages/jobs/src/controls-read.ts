import type { RunListQuery, RunPage, RunSnapshot } from "@relkit/contracts/jobs";
import { Effect, Result, Schema } from "effect";
import { operationContextEffect, requireMethodEffect } from "./control-support-methods.js";
import type { JobsRuntime } from "./runtime.js";
/** Expected native run read failure with its original compatibility cause.
 * @example new ControlReadFailure({ cause: new Error("read unavailable") });
 */
export class ControlReadFailure extends Schema.TaggedError<ControlReadFailure>()(
  "Jobs.ControlReadFailure",
  { cause: Schema.Defect() },
) {}
/** Checks read capability and requests one native run in Effect.
 * @param runtime - Jobs runtime and native adapter.
 * @param locator - Native run locator.
 * @param signal - Optional caller cancellation signal.
 * @returns A run snapshot or ControlReadFailure.
 * @example Effect.runPromise(getRunOperationEffect(runtime, "run-1"));
 */
export const getRunOperationEffect = Effect.fn("Jobs.getRunOperation")(function* (
  runtime: JobsRuntime,
  locator: string,
  signal?: AbortSignal,
) {
  yield* Effect.mapError(
    requireMethodEffect(runtime, "read", "get"),
    (error) => new ControlReadFailure({ cause: error.cause }),
  );
  const context = yield* Effect.mapError(
    operationContextEffect(runtime, signal),
    (error) => new ControlReadFailure({ cause: error.cause }),
  );
  return yield* Effect.tryPromise({
    try: () => runtime.adapter.get(locator, context),
    catch: (cause) => new ControlReadFailure({ cause }),
  });
});
/** Promise compatibility read for internal control consumers.
 * @param runtime - Jobs runtime and native adapter.
 * @param locator - Native run locator.
 * @param signal - Optional caller cancellation signal.
 * @returns A run snapshot.
 * @throws The original capability, context, or provider error.
 * @example await getRunValue(runtime, "run-1");
 */
export async function getRunValue(
  runtime: JobsRuntime,
  locator: string,
  signal?: AbortSignal,
): Promise<RunSnapshot> {
  const result = await Effect.runPromise(
    Effect.result(getRunOperationEffect(runtime, locator, signal)),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Checks list capability and validates the page limit before native IO.
 * @param runtime - Jobs runtime and native adapter.
 * @param query - Filters and optional page limit.
 * @param signal - Optional caller cancellation signal.
 * @returns A page of run snapshots or ControlReadFailure.
 * @example Effect.runPromise(listRunsOperationEffect(runtime, { limit: 25 }));
 */
export const listRunsOperationEffect = Effect.fn("Jobs.listRunsOperation")(function* (
  runtime: JobsRuntime,
  query: RunListQuery = {},
  signal?: AbortSignal,
) {
  yield* Effect.mapError(
    requireMethodEffect(runtime, "list", "list"),
    (error) => new ControlReadFailure({ cause: error.cause }),
  );
  const limit = query.limit ?? 25;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    return yield* new ControlReadFailure({
      cause: new RangeError("Run list limit must be between 1 and 100"),
    });
  const context = yield* Effect.mapError(
    operationContextEffect(runtime, signal),
    (error) => new ControlReadFailure({ cause: error.cause }),
  );
  return yield* Effect.tryPromise({
    try: () => runtime.adapter.list({ ...query, limit }, context),
    catch: (cause) => new ControlReadFailure({ cause }),
  });
});
/** Promise compatibility listing for internal control consumers.
 * @param runtime - Jobs runtime and native adapter.
 * @param query - Filters and optional page limit.
 * @param signal - Optional caller cancellation signal.
 * @returns A page of run snapshots.
 * @throws The original capability, limit, context, or provider error.
 * @example await listRunsValue(runtime, { limit: 25 });
 */
export async function listRunsValue(
  runtime: JobsRuntime,
  query: RunListQuery = {},
  signal?: AbortSignal,
): Promise<RunPage<RunSnapshot>> {
  const result = await Effect.runPromise(
    Effect.result(listRunsOperationEffect(runtime, query, signal)),
  );
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
