/** Proves accepted native durable work and acknowledgement-gap recovery survive a physical flat-to-grouped source move. */
import { expect, test } from "bun:test";
import { Effect, Schema } from "effect";
import { RestartLayout, restartLayoutLayer } from "./layout-move.service.js";
import { RestartJobInvocation } from "./layout-move.schemas.js";

for (const crash of ["after-lease", "after-ack"] as const)
  test(
    `recovers ${crash} work through the moved original target without rewriting prior state`,
    () =>
      Effect.runPromise(
        Effect.gen(function* () {
          const fixture = yield* RestartLayout;
          const crashed = yield* fixture.worker(fixture.root, false, "job", [crash, "0"]);
          expect(crashed.exitCode).not.toBe(0);
          const path = "jobs/" + encodeURIComponent("tests.restart.jobs") + "/records.ndjson";
          const prior = yield* fixture.read(path);
          const oldRecords = prior.trim().split("\n");
          expect(oldRecords).toHaveLength(3);
          yield* fixture.move;
          const restarted = yield* fixture.worker(fixture.root, true, "job", ["recover", "10"]);
          expect(restarted.exitCode, restarted.errors).toBe(0);
          const records = yield* fixture.read(path);
          expect(records.startsWith(prior)).toBe(true);
          const last = yield* Schema.decodeUnknownEffect(
            Schema.fromJsonString(Schema.Record(Schema.String, Schema.Json)),
          )(records.trim().split("\n").at(-1));
          expect(last.kind).toBe("completed");
          const contents = yield* fixture.read("invocations.ndjson");
          const invocations = yield* Effect.forEach(contents.trim().split("\n"), (line) =>
            Schema.decodeUnknownEffect(Schema.fromJsonString(RestartJobInvocation))(line),
          );
          expect(invocations).toEqual(
            crash === "after-lease"
              ? [{ orderId: "order-1", attempt: 2 }]
              : [
                  { orderId: "order-1", attempt: 1 },
                  { orderId: "order-1", attempt: 2 },
                ],
          );
        }).pipe(Effect.provide(restartLayoutLayer)),
      ),
    45_000,
  );
