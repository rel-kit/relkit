/**
 * Owns canonical development persistence behind its substitutable native adapter.
 * Acquisition stages register releases with one child Scope. Failure closes that
 * same owner before propagating the complete Cause; public callbacks borrow it.
 */
import { Effect } from "effect";
import { observeCli } from "../cli-runtime.js";
import { telemetryLifetimeEffect } from "./dev-telemetry-lifetime.js";
import { acquireTelemetryCore } from "./dev-telemetry-core.js";
import { acquireTelemetryFacade } from "./dev-telemetry-facade.js";
import type { TelemetryConfiguration } from "@relkit/observability";

/**
 * Acquires persistent telemetry in the caller's explicit Scope.
 * @param projectRoot - Installed application root; persistent data stays user-owned.
 * @param configuration - Initial model-owner capture, redaction and retention policy.
 * @param onFailure - Existing best-effort native failure notification.
 * @returns Existing handle after all mandatory persistent resources are acquired.
 */
export const makeDevTelemetryEffect = Effect.fn("DevTelemetry.acquire")(
  function* (
    projectRoot: string,
    configuration: TelemetryConfiguration = {},
    onFailure: (error: Error) => void = () => undefined,
  ) {
    const lifetime = yield* telemetryLifetimeEffect();
    return yield* Effect.gen(function* () {
      const core = yield* acquireTelemetryCore(projectRoot, configuration, onFailure, lifetime);
      return yield* acquireTelemetryFacade(core, lifetime);
    }).pipe(Effect.onError(() => lifetime.close));
  },
  (effect) => observeCli("dev.telemetry.acquire", effect),
);
