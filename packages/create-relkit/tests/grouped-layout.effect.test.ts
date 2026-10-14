/** Checks scaffold classification parity and preservation of flat/grouped public boundaries. */
import { expect, it } from "@effect/vitest";
import { Effect, Logger } from "effect";
import { discoverProjectEffect, projectDiscoveryLive } from "../src/project-discovery.js";
import { scaffoldServiceBoundary } from "../src/scaffold-layout.js";
import { memoryFileSystem } from "./generator-services.fixture.js";

const root = "/memory/grouped-layout";
const base = {
  [root + "/package.json"]: '{"dependencies":{"@relkit/app":"0.7.5"}}',
  [root + "/relkit.config.ts"]:
    'import { defineApp } from "@relkit/app/config"; export default defineApp({});',
};
const service =
  'import { defineService } from "@relkit/app/services"; export default defineService({});';

it.effect("selects empty grouped scaffolding without treating helpers as services", () =>
  Effect.gen(function* () {
    const fixture = yield* memoryFileSystem({
      ...base,
      [root + "/src/helpers/value.ts"]: "export const value = 1;",
    });
    const discovered = yield* discoverProjectEffect(root).pipe(
      Effect.provide(projectDiscoveryLive),
      Effect.provide(fixture.layer),
      Effect.provide(Logger.layer([])),
    );
    expect(discovered.layout?.kind).toBe("grouped");
    expect(discovered.services).toEqual([]);
    expect(scaffoldServiceBoundary(discovered, "orders")).toBe("src/services/orders/service.ts");
  }),
);

it.effect("preserves existing service boundaries and new services in both valid layouts", () =>
  Effect.gen(function* () {
    for (const prefix of ["src", "src/services"]) {
      const fixture = yield* memoryFileSystem({
        ...base,
        [root + "/" + prefix + "/orders/service.ts"]: service,
      });
      const discovered = yield* discoverProjectEffect(root).pipe(
        Effect.provide(projectDiscoveryLive),
        Effect.provide(fixture.layer),
        Effect.provide(Logger.layer([])),
      );
      expect(scaffoldServiceBoundary(discovered, "orders")).toBe(prefix + "/orders/service.ts");
      expect(scaffoldServiceBoundary(discovered, "payments")).toBe(prefix + "/payments/service.ts");
      expect(discovered.services[0]?.domain).toBe("orders");
    }
  }),
);

it.effect("rejects mixed, nested and missing boundaries without mutating the filesystem", () =>
  Effect.gen(function* () {
    for (const sources of [
      {
        [root + "/src/orders/service.ts"]: service,
        [root + "/src/services/payments/service.ts"]: service,
      },
      { [root + "/src/services/orders/nested/service.ts"]: service },
      {
        [root + "/src/services/orders/get.function.ts"]:
          'import { defineFunction } from "@relkit/app/functions"; export default defineFunction({});',
      },
    ]) {
      const fixture = yield* memoryFileSystem({ ...base, ...sources });
      const before = yield* fixture.snapshot;
      const exit = yield* Effect.exit(
        discoverProjectEffect(root).pipe(
          Effect.provide(projectDiscoveryLive),
          Effect.provide(fixture.layer),
          Effect.provide(Logger.layer([])),
        ),
      );
      expect(exit._tag).toBe("Failure");
      expect(yield* fixture.snapshot).toEqual(before);
    }
  }),
);
