/**
 * Supplies deterministic ingress, storage and HTTP Layers for early telemetry.
 * Explicit barriers control persistent acquisition and acknowledgement; no fake
 * starts a port, worker, timer outside Effect, or a native database process.
 */
import { Context, Deferred, Effect, Layer, MutableRef, Ref } from "effect";
import { CliCleanup, cleanupLayer } from "../../src/services/cleanup.service.js";
import { CliHttp } from "../../src/services/http.service.js";
import { CliTelemetryListener } from "../../src/commands/dev-telemetry-listener.service.js";
import { CliTelemetryStorage } from "../../src/commands/dev-telemetry-storage.service.js";
import {
  CliTelemetryRelays,
  telemetryRelaysLayer,
} from "../../src/commands/dev-telemetry-relay.service.js";
import type { DevTelemetryEffects } from "../../src/commands/dev-telemetry.types.js";
import type { ObservabilityQuery } from "@relkit/observability";
import type { DevLogEvent } from "../../src/commands/dev.types.js";
import type { TelemetryRelayFixtureOptions } from "./telemetry-relay-fixture.types.js";
import type { TelemetryConfiguration } from "@relkit/observability";

/**
 * Creates a canonical facade with one scoped release receipt and explicit test counters.
 * @param released - Barrier observing physical store finalization.
 * @param configurations - Records accepted policy updates in call order.
 * @param configure - Test-controlled persistent policy acknowledgement.
 * @param append - Optional direct diagnostic admission boundary.
 * @returns Existing storage contract; unused query execution fails explicitly.
 */
function store(
  released: Deferred.Deferred<void>,
  configurations: Ref.Ref<TelemetryConfiguration[]>,
  configure: DevTelemetryEffects["configureEffect"],
  append?: DevTelemetryEffects["append"],
): DevTelemetryEffects {
  return {
    imported: { records: 0, malformed: 0 },
    root: "/test/observability",
    get query(): ObservabilityQuery {
      throw new Error("Query execution is outside this fixture");
    },
    status: () => ({
      protocol: "relkit.observability.query",
      version: 1,
      state: "ready",
      error: undefined,
      persisted: 0,
      failed: 0,
      dropped: 0,
      root: "/test/observability",
    }),
    closeStream: () => undefined,
    environment: {
      RELKIT_TELEMETRY_URL: "http://127.0.0.1:2",
      RELKIT_TELEMETRY_TOKEN: "store-token",
    },
    append:
      append ??
      (() => {
        throw new Error("Handoff must preserve envelope identities");
      }),
    configureEffect: (next) =>
      Ref.update(configurations, (previous) => [...previous, next]).pipe(
        Effect.andThen(configure(next)),
      ),
    configure: () => Promise.resolve(),
    handle: () => Promise.resolve(new Response("canonical query")),
    closeEffect: Deferred.succeed(released, undefined).pipe(Effect.asVoid),
    close: () => Effect.runPromise(Deferred.succeed(released, undefined).pipe(Effect.asVoid)),
  };
}

/**
 * Acquires the real relay policy over the same injectable live/test contracts.
 * @param options - Controlled storage, transport and presentation boundaries.
 * @returns Session facade, native ingress callback, barriers and safely captured requests.
 */
export const telemetryRelayFixture = Effect.fn("TelemetryRelayTest.fixture")(function* (
  options: TelemetryRelayFixtureOptions = {},
) {
  const acquire = yield* Deferred.make<void>();
  const acquired = yield* Deferred.make<void>();
  const acknowledge = yield* Deferred.make<void>();
  const persisted = yield* Deferred.make<void>();
  const released = yield* Deferred.make<void>();
  const ingress = yield* Ref.make<((request: Request) => Promise<Response>) | undefined>(undefined);
  const requests = yield* Ref.make<string[]>([]);
  const events = yield* Ref.make<DevLogEvent[]>([]);
  const configurations = yield* Ref.make<TelemetryConfiguration[]>([]);
  const native = Layer.mergeAll(
    cleanupLayer,
    Layer.succeed(CliTelemetryListener, {
      listen: (handler) =>
        Ref.set(ingress, handler).pipe(Effect.as({ url: "http://127.0.0.1:1", stop: Effect.void })),
    }),
    fixtureStorageLayer(
      acquired,
      acquire,
      released,
      configurations,
      options.configure ?? (() => Effect.void),
      options.append,
    ),
    fixtureHttpLayer(requests, persisted, acknowledge, options.request),
  );
  const context = yield* Layer.build(telemetryRelaysLayer.pipe(Layer.provideMerge(native)));
  const relay = yield* Context.get(context, CliTelemetryRelays).acquire("/test", {});
  const handler = yield* Ref.get(ingress);
  if (handler === undefined) return yield* Effect.die(new Error("Expected acquired ingress"));
  return {
    relay,
    handler,
    acquire,
    acquired,
    acknowledge,
    persisted,
    released,
    requests,
    events,
    configurations,
    cleanup: Context.get(context, CliCleanup),
    log: captureFixtureLog(events, options.log),
  };
});

/**
 * Captures terminal events before forwarding them to an optional synchronization hook.
 * @param events - Test-owned immutable event history.
 * @param log - Optional observer used to establish explicit test barriers.
 * @returns Native sink borrowing fixture state without owning asynchronous work.
 */
function captureFixtureLog(
  events: Ref.Ref<DevLogEvent[]>,
  log: TelemetryRelayFixtureOptions["log"],
) {
  return (event: DevLogEvent) => {
    MutableRef.set(events.ref, [...Ref.getUnsafe(events), event]);
    log?.(event);
  };
}

/**
 * Models delayed acquisition and physical release through the live storage contract.
 * @param acquired - Signals entry before any persistent facade exists.
 * @param acquire - Test-owned permission to finish acquisition.
 * @param released - Physical close acknowledgement owned by the acquired Scope.
 * @param configurations - Ordered accepted configuration receipts.
 * @param configure - Test-controlled configuration operation.
 * @param append - Optional diagnostic admission boundary.
 * @returns Deterministic storage authority without opening native resources.
 */
function fixtureStorageLayer(
  acquired: Deferred.Deferred<void>,
  acquire: Deferred.Deferred<void>,
  released: Deferred.Deferred<void>,
  configurations: Ref.Ref<TelemetryConfiguration[]>,
  configure: DevTelemetryEffects["configureEffect"],
  append?: DevTelemetryEffects["append"],
) {
  return Layer.succeed(CliTelemetryStorage, {
    acquire: () =>
      Effect.gen(function* () {
        yield* Deferred.succeed(acquired, undefined);
        yield* Deferred.await(acquire);
        return yield* Effect.acquireRelease(
          Effect.sync(() => store(released, configurations, configure, append)),
          (value) => value.closeEffect,
        );
      }),
  });
}

/**
 * Controls exact HTTP acknowledgement while retaining the production adapter shape.
 * @param requests - Captured immutable transport bodies.
 * @param persisted - Receipt that the current body reached the persistent boundary.
 * @param acknowledge - Test-owned barrier before a complete successful response.
 * @param request - Optional injected failure or acknowledgement policy.
 * @returns HTTP test authority; the relay still owns response-body and batch Scopes.
 */
function fixtureHttpLayer(
  requests: Ref.Ref<string[]>,
  persisted: Deferred.Deferred<void>,
  acknowledge: Deferred.Deferred<void>,
  request: TelemetryRelayFixtureOptions["request"],
) {
  return Layer.succeed(CliHttp, {
    request:
      request ??
      ((_url, options) =>
        Ref.update(requests, (previous) => [...previous, String(options?.body)]).pipe(
          Effect.andThen(Deferred.succeed(persisted, undefined)),
          Effect.andThen(Deferred.await(acknowledge)),
          Effect.as(Response.json({ ok: true })),
        )),
    text: (response) => Effect.promise(() => response.text()),
    json: () => Effect.die(new Error("Ingress must use bounded text and its own decoder")),
  });
}
