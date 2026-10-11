/**
 * Acquires canonical persistence without importing the native database library.
 * Validated policy, callbacks and resource releases belong to one session Scope;
 * its native callback context retains the owner's logger and cleanup authority.
 */
import { resolve } from "node:path";
import { Cause, Effect } from "effect";
import {
  normalizeTelemetryConfigurationEffect,
  type TelemetryConfiguration,
} from "@relkit/observability";
import { cliAdapterError, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliCleanup } from "../services/cleanup.service.js";
import { CliTelemetryNative } from "./dev-telemetry-native.service.js";
import { telemetryStateEffect, telemetryFailureCallback } from "./dev-telemetry-state.js";
import { telemetryAppendEffect } from "./dev-telemetry-store.js";
import { telemetryQuery } from "./dev-telemetry-query.js";
import {
  acquireTelemetryWorker,
  acquireTelemetryStream,
  acquireTelemetryQueue,
  acquireTelemetryRouter,
} from "./dev-telemetry-resources.js";
import type { TelemetryLifetime } from "./dev-telemetry-acquisition.types.js";

/**
 * Acquires every canonical dependency with its established release order.
 * @param projectRoot - Installed project root whose observability data stays user-owned.
 * @param configuration - Current validated telemetry policy.
 * @param onFailure - Best-effort safe failure callback.
 * @param lifetime - Caller-owned child Scope and release registrations.
 * @returns Complete acquired resources; failures close through the original caller's owner.
 */
export const acquireTelemetryCore = Effect.fn("DevTelemetry.acquireCore")(
  function* (
    projectRoot: string,
    configuration: TelemetryConfiguration,
    onFailure: (error: Error) => void,
    lifetime: TelemetryLifetime,
  ) {
    const native = yield* CliTelemetryNative;
    const config = yield* normalizeTelemetryConfigurationEffect(configuration).pipe(
      Effect.catchCause((cause) =>
        Effect.failCause(
          Cause.map(cause, (error) =>
            cliAdapterError("dev.telemetry.configuration", new TypeError(error.message)),
          ),
        ),
      ),
    );
    const state = yield* telemetryStateEffect(config);
    const failure = telemetryFailureCallback(state, onFailure);
    const context = yield* Effect.context<CliCleanup>();
    const root = resolve(
      projectRoot,
      process.env.RELKIT_OBSERVABILITY_ROOT ?? ".relkit/observability",
    );
    const token = yield* cliTry("dev.telemetry.token", () => crypto.randomUUID());
    const source = yield* cliTry("dev.telemetry.source", () => crypto.randomUUID());
    const { worker, imported } = yield* acquireTelemetryWorker(
      lifetime,
      native,
      root,
      config,
      failure,
    );
    const stream = yield* acquireTelemetryStream(lifetime, native, state);
    const append = telemetryAppendEffect(worker, stream, state, failure);
    const queue = yield* acquireTelemetryQueue(lifetime, context, append, failure);
    const query = telemetryQuery(worker, context);
    const app = yield* acquireTelemetryRouter(lifetime, query, stream);
    return {
      native,
      state,
      failure,
      context,
      root,
      token,
      source,
      worker,
      imported,
      stream,
      append,
      queue,
      query,
      app,
    };
  },
  (effect) => observeCli("dev.telemetry.acquire-core", effect),
);
