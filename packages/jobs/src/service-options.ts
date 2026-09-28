import { assertJsonValue, type JsonValue } from "@relkit/contracts";
import { Effect, Result } from "effect";
import { observeJobs } from "./jobs-observability.js";
import type { JobsServiceOptions, JobsServiceOptionName } from "./service-options.types.js";
import {
  JobsServiceOptionsError,
  validateJobsServiceOptionsEffect,
} from "./service-options-validation.js";
export type {
  JobsServiceOptions,
  JobsServiceBehavior,
  JobsServiceOptionName,
} from "./service-options.types.js";
export {
  validateJobsServiceOptions,
  validateJobsServiceOptionsEffect,
  JobsServiceOptionsError,
} from "./service-options-validation.js";
/** Serializes validated service options into a provider neutral record.
 * @param value - Common service options.
 * @param native - Optional provider native JSON.
 * @returns A frozen record or JobsServiceOptionsError.
 * @example Effect.runSync(serializeJobsServiceOptionsEffect({}, undefined));
 */
export const serializeJobsServiceOptionsEffect = Effect.fn("Jobs.serializeServiceOptions")(
  (value: JobsServiceOptions | undefined, native: JsonValue | undefined) =>
    observeJobs(
      "serviceOptions.serialize",
      Effect.try({
        try: () => serializeValue(value, native),
        catch: (error) => {
          if (error instanceof Error) return new JobsServiceOptionsError({ reason: error.message });
          throw error;
        },
      }),
    ),
);
/** Synchronously serializes service options.
 * @param value - Common service options.
 * @param native - Optional provider native JSON.
 * @returns A frozen JSON record.
 * @throws TypeError when a field is not JSON.
 * @example serializeJobsServiceOptions({}, undefined);
 */
export function serializeJobsServiceOptions(
  value: JobsServiceOptions | undefined,
  native: JsonValue | undefined,
): Readonly<Record<string, JsonValue>> {
  const result = Effect.runSync(Effect.result(serializeJobsServiceOptionsEffect(value, native)));
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
  return result.success;
}
function serializeValue(
  value: JobsServiceOptions | undefined,
  native: JsonValue | undefined,
): Readonly<Record<string, JsonValue>> {
  const common: Record<string, JsonValue> = {};
  if (value?.limits !== undefined) common.limits = json(value.limits);
  if (value?.workers !== undefined) common.workers = json(value.workers);
  if (value?.observation !== undefined) common.observation = json(value.observation);
  if (value?.maxElapsed !== undefined) common.maxElapsed = json(value.maxElapsed);
  if (value?.hookTimeout !== undefined) common.hookTimeout = json(value.hookTimeout);
  if (value?.shutdownGrace !== undefined) common.shutdownGrace = json(value.shutdownGrace);
  if (native !== undefined) assertJsonValue(native);
  return Object.freeze({
    ...common,
    ...(native === undefined ? {} : { native }),
  });
}
/** Parses common options from a stored service behavior record.
 * @param value - Stored behavior record.
 * @returns Frozen common options or JobsServiceOptionsError.
 * @example Effect.runSync(deserializeJobsServiceOptionsEffect({}));
 */
export const deserializeJobsServiceOptionsEffect = Effect.fn("Jobs.deserializeServiceOptions")(
  function* (value: unknown) {
    if (value === undefined) return {};
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return yield* new JobsServiceOptionsError({
        reason: "Jobs service behavior must be an object",
      });
    const { native: _native, ...common } = value as Record<string, unknown>;
    const options = common as JobsServiceOptions;
    yield* validateJobsServiceOptionsEffect(options);
    return Object.freeze(options);
  },
  (effect) => observeJobs("serviceOptions.deserialize", effect),
);
/** Synchronously reads common options from stored service behavior.
 * @param value - Stored behavior record.
 * @returns Frozen common options.
 * @throws TypeError when the record or an option is invalid.
 * @example deserializeJobsServiceOptions({});
 */
export function deserializeJobsServiceOptions(value: unknown): JobsServiceOptions {
  const result = Effect.runSync(Effect.result(deserializeJobsServiceOptionsEffect(value)));
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
  return result.success;
}
/** Checks a provider's supported service option names in Effect.
 * @param value - Authored service options.
 * @param supported - Names supported by the provider.
 * @returns Void or JobsServiceOptionsError.
 * @example Effect.runSync(assertSupportedJobsServiceOptionsEffect({}, []));
 */
export const assertSupportedJobsServiceOptionsEffect = Effect.fn("Jobs.assertServiceOptions")(
  function* (value: JobsServiceOptions, supported: readonly JobsServiceOptionName[]) {
    const allowed = new Set(supported);
    for (const name of [
      "limits",
      "workers",
      "observation",
      "maxElapsed",
      "hookTimeout",
      "shutdownGrace",
    ] as const) {
      if (value[name] !== undefined && !allowed.has(name))
        return yield* new JobsServiceOptionsError({
          reason: `RELKIT_JOBS_SERVICE_OPTION_UNSUPPORTED:${name}`,
        });
    }
  },
  (effect) => observeJobs("serviceOptions.assertSupported", effect),
);
/** Synchronously checks a provider's supported option names.
 * @param value - Authored service options.
 * @param supported - Names supported by the provider.
 * @returns Void when every option is supported.
 * @throws Error with the unsupported option name.
 * @example assertSupportedJobsServiceOptions({}, []);
 */
export function assertSupportedJobsServiceOptions(
  value: JobsServiceOptions,
  supported: readonly JobsServiceOptionName[],
): void {
  const result = Effect.runSync(
    Effect.result(assertSupportedJobsServiceOptionsEffect(value, supported)),
  );
  if (Result.isFailure(result)) throw new Error(result.failure.reason);
}
function json(value: unknown): JsonValue {
  assertJsonValue(value);
  return value;
}
