/** Proves native SQLite checkpoints, waiting revisions and single-winner graph resumption survive a whole service source move. */
import { expect, test } from "bun:test";
import { Effect } from "effect";
import { RestartLayout, restartLayoutLayer, restartAgentReport } from "./layout-move.service.js";

test(
  "resumes a waiting agent through moved sources exactly once across competing native processes",
  () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const fixture = yield* RestartLayout;
        const paused = yield* fixture.worker(fixture.root, false, "agent", ["pause"]);
        expect(paused.exitCode, paused.errors).toBe(0);
        const pause = yield* restartAgentReport(paused.output);
        expect(pause.outcome).toBe("waiting");
        if (!pause.revision) throw new Error("Native waiting checkpoint omitted its revision");
        yield* fixture.move;
        const inspected = yield* fixture.worker(fixture.root, true, "agent", ["inspect"]);
        expect(inspected.exitCode, inspected.errors).toBe(0);
        expect(yield* restartAgentReport(inspected.output)).toMatchObject({
          outcome: "snapshot",
          status: "waiting",
          revision: pause.revision,
          runs: ["waiting"],
          assistant: [],
          terminal: [],
        });
        const competitors = yield* Effect.all(
          [
            fixture.worker(fixture.root, true, "agent", ["resume", pause.revision, "one"]),
            fixture.worker(fixture.root, true, "agent", ["resume", pause.revision, "two"]),
            releaseCompetitors(),
          ],
          { concurrency: 3 },
        );
        const outcomes: string[] = [];
        for (const result of competitors.slice(0, 2)) {
          if (!result) throw new Error("Native competitor omitted settlement");
          expect(result.exitCode, result.errors).toBe(0);
          outcomes.push((yield* restartAgentReport(result.output)).outcome);
        }
        expect(outcomes.sort()).toEqual(["fulfilled", "rejected"]);
        yield* verifyCompletedAgent();
      }).pipe(Effect.provide(restartLayoutLayer)),
    ),
  45_000,
);

/**
 * Verifies one public completion and its preserved native node journal after competing resume processes exit.
 * @returns Completion after the native inspect process and all persisted journal observations settle.
 */
const verifyCompletedAgent = Effect.fn("RestartLayout.verifyCompletedAgent")(function* () {
  const fixture = yield* RestartLayout;
  const final = yield* fixture.worker(fixture.root, true, "agent", ["inspect"]);
  expect(final.exitCode, final.errors).toBe(0);
  expect(yield* restartAgentReport(final.output)).toMatchObject({
    outcome: "snapshot",
    status: "idle",
    runs: ["waiting", "succeeded"],
    assistant: [
      {
        role: "assistant",
        parts: [{ kind: "text", text: '{"result":"approved"}', state: "complete" }],
      },
    ],
    terminal: [{ output: { result: "approved" } }],
  });
  expect((yield* fixture.read("node-entries.ndjson")).trim().split("\n")).toEqual([
    '{"node":"review"}',
    '{"node":"review"}',
    '{"node":"finish"}',
  ]);
});

/**
 * Releases the native resume barrier only after both independently owned contenders observe the same revision.
 * @returns Completion after both ready markers and publication of the native go marker.
 */
const releaseCompetitors = Effect.fn("RestartLayout.releaseCompetitors")(
  function* () {
    const fixture = yield* RestartLayout;
    for (const contender of ["one", "two"]) {
      while (
        !(yield* Effect.promise(() =>
          Bun.file(`${fixture.root}/resume-ready-${contender}`).exists(),
        ))
      )
        yield* Effect.sleep(5);
    }
    yield* fixture.write("resume-go", "go");
  },
  (effect) => effect.pipe(Effect.timeout("10 seconds")),
);
