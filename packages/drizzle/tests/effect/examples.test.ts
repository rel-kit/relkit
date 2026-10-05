import { it } from "@effect/vitest";
import { expect } from "vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import { sqliteTable, integer } from "drizzle-orm/sqlite-core";
import { DrizzleOwner, drizzleOwnerLayer } from "../../src/owner.js";
import { runDrizzlePromise } from "../../src/failure.js";
import { defineDrizzleService, drizzleRuntimeOf } from "../../src/service.js";

it.effect("checks the documented live owner Layer and Promise runtime composition", () =>
  Effect.gen(function* () {
    const records = sqliteTable("records", { id: integer().primaryKey() });
    let releases = 0;
    const declaration = drizzleRuntimeOf(
      defineDrizzleService({
        schema: { records },
        client: () => ({}),
        dispose: () => {
          releases++;
        },
      }),
    );
    const owner = ManagedRuntime.make(drizzleOwnerLayer(declaration, {}));
    yield* Effect.acquireUseRelease(
      Effect.promise(() => owner.runPromise(DrizzleOwner)),
      (service) =>
        Effect.gen(function* () {
          expect(yield* service.work(Effect.succeed(1))).toBe(1);
          yield* service.beginClose();
          expect(
            yield* service
              .work(Effect.succeed(2))
              .pipe(Effect.catchTag("DrizzleFailure", () => Effect.succeed(-1))),
          ).toBe(-1);
          yield* service.awaitDrained();
        }),
      () => Effect.promise(() => owner.dispose()),
    );
    expect(releases).toBe(1);
    const empty = ManagedRuntime.make(Layer.empty);
    expect(yield* Effect.promise(() => runDrizzlePromise(empty, Effect.succeed(1)))).toBe(1);
    yield* Effect.promise(() => empty.dispose());
  }),
);
