import { expect, it } from "@effect/vitest";
import { GRAPH_VERSION } from "@relkit/contracts";
import { Deferred, Effect, Fiber, Layer } from "effect";
import { runEngineSync } from "../src/engine-runtime.js";
import type { ProviderRegistryOptions } from "../src/provider-registry-types.js";
import { ProviderRegistryLive, ProviderRegistryService } from "../src/provider-registry.service.js";

it.effect("closes providers while keeping the calling scope alive", () =>
  Effect.gen(function* () {
    const events: string[] = [];
    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            events.push("parent");
          }),
        );
        const service = yield* ProviderRegistryService;
        const registry = yield* service.acquire(
          options(() => {
            events.push("provider");
          }),
        );
        yield* Effect.promise(() => registry.release());
        expect(events).toEqual(["provider"]);
      }),
    );
    expect(events).toEqual(["provider", "parent"]);
  }).pipe(Effect.provide(ProviderRegistryLive)),
);

it.effect("releases acquired resources when readiness is interrupted", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    let released = 0;
    const config = options(
      () => {
        released += 1;
      },
      () => {
        runEngineSync(Deferred.succeed(started, undefined));
        return new Promise<void>(() => undefined);
      },
    );
    const work = Effect.scoped(
      Effect.gen(function* () {
        return yield* (yield* ProviderRegistryService).acquire(config);
      }),
    );
    const fiber = yield* work.pipe(Effect.forkChild);
    yield* Deferred.await(started);
    yield* Fiber.interrupt(fiber);
    expect(released).toBe(1);
  }).pipe(Effect.provide(ProviderRegistryLive)),
);

it.effect("allows test layers to replace provider acquisition", () =>
  Effect.gen(function* () {
    const called = yield* Deferred.make<string>();
    const fake = Layer.succeed(ProviderRegistryService, {
      acquire: (config) =>
        Deferred.succeed(called, config.generationId).pipe(
          Effect.andThen(Effect.fail(new Error("test provider unavailable"))),
        ),
    });
    const result = yield* Effect.gen(function* () {
      return yield* (yield* ProviderRegistryService).acquire(options(() => undefined));
    }).pipe(Effect.provide(fake), Effect.result);
    expect(yield* Deferred.await(called)).toBe("generation.test");
    expect(result._tag).toBe("Failure");
  }),
);

/** Construct one required cache binding with explicit lifecycle fakes.
 * @param release - Provider cleanup observation.
 * @param ready - Optional controllable readiness callback.
 * @returns A generation configuration without network or filesystem work.
 */
function options(release: () => void, ready?: () => Promise<void>): ProviderRegistryOptions {
  const source = { file: "src/app.ts", line: 1, column: 1 };
  return {
    generationId: "generation.test",
    graph: {
      contractVersion: GRAPH_VERSION,
      nodes: [
        {
          kind: "provider",
          id: "provider.cache",
          source,
          capability: "cache",
          profile: "default",
          adapter: {
            integrationId: "test",
            adapterId: "cache",
            protocolVersion: 1,
            behavior: {},
            connectionContract: {},
            connection: {},
            features: [],
          },
          providerSource: { kind: "connected" },
          namedValues: [],
          deploymentRoles: [],
        },
        { kind: "cache", id: "cache.test", source, profile: "default", key: null, value: null },
      ],
      edges: [{ kind: "uses-provider-profile", from: "cache.test", to: "provider.cache" }],
    },
    runtimeIntegrationModules: [
      {
        packageName: "test",
        packageVersion: "1",
        exportName: "runtime",
        module: {
          runtimeIntegration: {
            kind: "runtime-integration",
            integrationId: "test",
            registrations: [
              {
                capability: "cache",
                adapterId: "cache",
                protocolVersion: 1,
                create: () => ({ value: {}, release, ...(ready === undefined ? {} : { ready }) }),
              },
            ],
          },
        },
      },
    ],
  };
}
