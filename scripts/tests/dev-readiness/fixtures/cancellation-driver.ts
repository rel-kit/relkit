/**
 * Exercises the actual benchmark signal owner and detached command acquisition.
 * Its handshake appears only after the inner bun dev child reports its real PID;
 * external test cancellation must join the measurement Scope before host exit.
 */
import { resolve } from "node:path";
import { Effect, Schedule } from "effect";
import { runBenchmarkMain } from "../../../dev-readiness/benchmark-main.js";
import { startBenchmarkChild } from "../../../dev-readiness/benchmark-process.js";

const main = Effect.gen(function* () {
  const child = yield* startBenchmarkChild({
    projectRoot: resolve(import.meta.dir, "cancellable"),
    environment: { ...process.env },
    url: "http://127.0.0.1:1/unused",
    expectedStatus: 200,
    expectedBody: "unused",
    deadlineMs: 1_000,
  });
  const output = yield* child.output().pipe(
    Effect.repeat({
      schedule: Schedule.spaced(5),
      until: (output) => output.includes("FIXTURE_CHILD:"),
    }),
    Effect.timeout(5_000),
  );
  yield* Effect.sync(() => console.log(output));
  yield* Effect.never;
});

await runBenchmarkMain(Effect.scoped(main));
