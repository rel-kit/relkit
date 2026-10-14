/** Proves native PostgreSQL receipts and schedule reconciliation retain identity when their complete worker service source moves. */
import { expect, test } from "bun:test";
import { Effect, Layer, Schema } from "effect";
import { RestartLayout, restartLayoutLayer } from "./layout-move.service.js";
import { RestartPostgres, restartPostgresLayer } from "./layout-move-postgres.service.js";

import { RestartScheduleReport as report } from "./layout-move.schemas.js";

test.skipIf(process.env.RELKIT_TEST_DOCKER !== "1")(
  "retains the original native receipt and one schedule across a source move and worker restart",
  () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const fixture = yield* RestartLayout,
          database = yield* RestartPostgres;
        const accepted = yield* fixture.worker(
          fixture.root,
          false,
          "effect-mq",
          ["accept"],
          database.environment,
        );
        expect(accepted.exitCode, accepted.errors).toBe(0);
        const before = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(report))(
          accepted.output.trim().split("\n").at(-1),
        );
        expect(before).toMatchObject({
          id: "layout-move-accepted",
          scheduleCount: 1,
          state: "waiting",
        });
        yield* fixture.move;
        const recovered = yield* fixture.worker(
          fixture.root,
          true,
          "effect-mq",
          ["recover"],
          database.environment,
        );
        expect(recovered.exitCode, recovered.errors).toBe(0);
        expect(
          yield* Schema.decodeUnknownEffect(Schema.fromJsonString(report))(
            recovered.output.trim().split("\n").at(-1),
          ),
        ).toEqual({
          id: before.id,
          value: "accepted-before-source-move",
          scheduleCount: 1,
          buildId: "flat-build",
        });
      }).pipe(Effect.provide(Layer.merge(restartLayoutLayer, restartPostgresLayer))),
    ),
  120_000,
);
