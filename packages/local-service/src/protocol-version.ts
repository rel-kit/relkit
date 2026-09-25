import { Effect } from "effect";
import { LocalServiceVersionFailure } from "./local-service-errors.js";
import { observeLocalService, runLocalService } from "./local-service-observability.js";
import {
  LOCAL_SERVICE_PLAN_VERSION,
  LOCAL_SERVICE_STATE_VERSION,
  PROVIDER_OVERRIDE_STATE_VERSION,
} from "./protocol.js";
import type {
  LocalServicePlan,
  LocalServiceState,
  LocalServiceVersionErrorCode,
  ProviderOverrideState,
} from "./protocol.types.js";

/** Check one artifact version without starting a separate public operation span.
 * @param value - Parsed artifact candidate.
 * @param expected - Supported version.
 * @param label - Artifact label for errors.
 * @param code - Stable error code.
 * @param command - Command that regenerates the artifact.
 * @returns An Effect that fails with LocalServiceVersionFailure for a stale version.
 * @example Effect.runSync(checkVersionEffect({ version: 1 }, 1, "Local-service plan", "RELKIT_LOCAL_SERVICE_PLAN_VERSION_UNSUPPORTED", "relkit check"));
 */
export const checkVersionEffect = Effect.fn("LocalService.assertVersion")(function* (
  value: unknown,
  expected: number,
  label: string,
  code: LocalServiceVersionErrorCode,
  command: string,
) {
  const version =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).version
      : undefined;
  if (version !== expected)
    return yield* Effect.fail(
      new LocalServiceVersionFailure({ code, label, version, expected, command }),
    );
});

/** Check a local-service plan version in the Effect error channel.
 * @param value - Parsed plan candidate.
 * @returns An Effect that succeeds for v1 or fails with LocalServiceVersionFailure.
 * @example Effect.runSync(assertLocalServicePlanVersionEffect({ version: 1 }));
 */
export const assertLocalServicePlanVersionEffect = Effect.fn("LocalService.assertPlanVersion")(
  function* (value: unknown) {
    yield* observeLocalService(
      "plan.assert-version",
      checkVersionEffect(
        value,
        LOCAL_SERVICE_PLAN_VERSION,
        "Local-service plan",
        "RELKIT_LOCAL_SERVICE_PLAN_VERSION_UNSUPPORTED",
        "relkit check",
      ),
    );
  },
);

/** Check a local-service state version in the Effect error channel.
 * @param value - Parsed state candidate.
 * @returns An Effect that succeeds for v1 or fails with LocalServiceVersionFailure.
 * @example Effect.runSync(assertLocalServiceStateVersionEffect({ version: 1 }));
 */
export const assertLocalServiceStateVersionEffect = Effect.fn("LocalService.assertStateVersion")(
  function* (value: unknown) {
    yield* observeLocalService(
      "state.assert-version",
      checkVersionEffect(
        value,
        LOCAL_SERVICE_STATE_VERSION,
        "Local-service state",
        "RELKIT_LOCAL_SERVICE_STATE_VERSION_UNSUPPORTED",
        "relkit local up",
      ),
    );
  },
);

/** Check an override artifact version in the Effect error channel.
 * @param value - Parsed override candidate.
 * @returns An Effect that succeeds for v1 or fails with LocalServiceVersionFailure.
 * @example Effect.runSync(assertProviderOverrideStateVersionEffect({ version: 1 }));
 */
export const assertProviderOverrideStateVersionEffect = Effect.fn(
  "LocalService.assertOverrideVersion",
)(function* (value: unknown) {
  yield* observeLocalService(
    "override.assert-version",
    checkVersionEffect(
      value,
      PROVIDER_OVERRIDE_STATE_VERSION,
      "Provider-override state",
      "RELKIT_PROVIDER_OVERRIDE_STATE_VERSION_UNSUPPORTED",
      "relkit local up",
    ),
  );
});

/** Assert a local-service plan version synchronously.
 * @param value - Parsed plan candidate.
 * @returns Nothing; narrows the value to LocalServicePlan.
 * @throws LocalServiceVersionError when the version differs.
 * @example assertLocalServicePlanVersion({ version: 1 });
 */
export function assertLocalServicePlanVersion(value: unknown): asserts value is LocalServicePlan {
  runLocalService(assertLocalServicePlanVersionEffect(value));
}

/** Assert a local-service state version synchronously.
 * @param value - Parsed state candidate.
 * @returns Nothing; narrows the value to LocalServiceState.
 * @throws LocalServiceVersionError when the version differs.
 * @example assertLocalServiceStateVersion({ version: 1 });
 */
export function assertLocalServiceStateVersion(value: unknown): asserts value is LocalServiceState {
  runLocalService(assertLocalServiceStateVersionEffect(value));
}

/** Assert a provider override version synchronously.
 * @param value - Parsed override candidate.
 * @returns Nothing; narrows the value to ProviderOverrideState.
 * @throws LocalServiceVersionError when the version differs.
 * @example assertProviderOverrideStateVersion({ version: 1 });
 */
export function assertProviderOverrideStateVersion(
  value: unknown,
): asserts value is ProviderOverrideState {
  runLocalService(assertProviderOverrideStateVersionEffect(value));
}
