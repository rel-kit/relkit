/**
 * Acquires bounded redacted ingress before backend launch and keeps persistence
 * behind a separate scoped run. Layer-owned adapters are captured once; callbacks
 * borrow the session state and preserve stable producer keys for ordered handoff.
 */
import { Context, Effect, Layer, Ref, Semaphore } from "effect";
import { mapErrorCause } from "../services/map-error-cause.js";
import { createObservabilityStream, type DiagnosticRecord } from "@relkit/observability";
import { EarlyRetention } from "@relkit/observability/early";
import {
  normalizeTelemetryConfigurationEffect,
  type TelemetryConfiguration,
} from "@relkit/observability/telemetry";
import { cliAdapterError, cliTry } from "../cli-errors.js";
import { observeCli } from "../cli-runtime.js";
import { CliCleanup, cleanupEffect } from "../services/cleanup.service.js";
import { CliHttp } from "../services/http.service.js";
import { CliTelemetryListener } from "./dev-telemetry-listener.service.js";
import { CliTelemetryStorage } from "./dev-telemetry-storage.service.js";
import { telemetryRelayIngress } from "./dev-telemetry-relay-ingress.js";
import { telemetryRelayCallbacks } from "./dev-telemetry-relay-callbacks.js";
import { reportUncommittedTelemetry } from "./dev-telemetry-relay-diagnostics.js";
import type {
  DevTelemetryRelayOperations,
  DevTelemetryRelayState,
} from "./dev-telemetry-relay.types.js";
import type { TelemetryListenerOperations } from "./dev-telemetry-listener.types.js";
import type { TelemetryStorageOperations } from "./dev-telemetry-storage.types.js";
import type { HttpCapabilities } from "../services/http.types.js";
import type { CleanupCapabilities } from "../services/cleanup.types.js";
import type { DevTelemetryEffects } from "./dev-telemetry.types.js";
import type { DevLog } from "./dev.types.js";

/** Shared adapters have no request state; each acquire creates fresh bounded retention. */
export class CliTelemetryRelays extends Context.Service<
  CliTelemetryRelays,
  DevTelemetryRelayOperations
>()("relkit/cli/TelemetryRelays", {
  make: Effect.gen(function* () {
    const cleanup = yield* CliCleanup;
    const http = yield* CliHttp;
    const listener = yield* CliTelemetryListener;
    const storage = yield* CliTelemetryStorage;
    return {
      acquire: Effect.fn("DevTelemetry.acquireRelay")(
        (root: string, configuration: TelemetryConfiguration) =>
          observeCli(
            "dev.telemetry.acquire-relay",
            acquireRelay(root, configuration, cleanup, http, listener, storage),
          ),
      ),
    } satisfies DevTelemetryRelayOperations;
  }),
}) {}

/** Composes policy with the caller's shared native adapters and cleanup graph. */
export const telemetryRelaysLayer = Layer.effect(CliTelemetryRelays, CliTelemetryRelays.make);

/**
 * Creates session state and acquires its authenticated ingress listener in Scope.
 * @param root - Current project root; never included in early records.
 * @param configuration - Validated graph telemetry settings.
 * @param cleanup - Captured diagnostic/release evidence authority.
 * @param http - Captured bounded request/body authority.
 * @param listener - Captured native listener adapter.
 * @param storage - Captured delayed persistence adapter.
 * @returns Callback facade plus a scoped support operation; no persistent startup yet.
 */
const acquireRelay = Effect.fn("DevTelemetry.relaySession")(function* (
  root: string,
  configuration: TelemetryConfiguration,
  cleanup: CleanupCapabilities,
  http: HttpCapabilities,
  listener: TelemetryListenerOperations,
  storage: TelemetryStorageOperations,
) {
  const normalized = yield* normalizeTelemetryConfigurationEffect(configuration).pipe(
    mapErrorCause((error) => cliAdapterError("dev.telemetry.configuration", error)),
  );
  const state: DevTelemetryRelayState = {
    root,
    cleanup,
    http,
    context: Context.add(yield* Effect.context(), CliCleanup, cleanup),
    token: yield* cliTry("dev.telemetry.token", () => crypto.randomUUID()),
    source: yield* cliTry("dev.telemetry.source", () => crypto.randomUUID()),
    sequence: yield* Ref.make(0),
    closed: yield* Ref.make(false),
    diagnostic: yield* Ref.make<DevLog | undefined>(undefined),
    pendingLoss: yield* Ref.make<DiagnosticRecord | undefined>(undefined),
    configuration: yield* Ref.make(normalized),
    configurationGate: yield* Semaphore.make(1),
    store: yield* Ref.make<DevTelemetryEffects | undefined>(undefined),
    storageState: yield* Ref.make<"starting" | "ready" | "unavailable">("starting"),
    buffer: yield* EarlyRetention.make({
      ...(normalized.localRetention?.maxRecords === undefined
        ? {}
        : { maxRecords: normalized.localRetention.maxRecords }),
      ...(normalized.localRetention?.maxBytes === undefined
        ? {}
        : { maxBytes: normalized.localRetention.maxBytes }),
    }).pipe(mapErrorCause((error) => cliAdapterError("dev.telemetry.early-policy", error))),
    stream: createObservabilityStream({
      ...(normalized.localRetention?.maxRecords === undefined
        ? {}
        : { maxEvents: normalized.localRetention.maxRecords }),
    }),
  };
  const server = yield* Effect.acquireRelease(
    listener.listen((request) => telemetryRelayIngress(state, request)),
    (server) =>
      Ref.set(state.closed, true).pipe(
        Effect.tap(() => Effect.sync(() => state.stream.close())),
        Effect.andThen(reportUncommittedTelemetry(state)),
        Effect.andThen(
          cleanupEffect("dev.telemetry.relay.release", server.stop).pipe(
            Effect.provideService(CliCleanup, cleanup),
          ),
        ),
      ),
  );
  return telemetryRelayCallbacks(state, storage, server.url);
});
