/** Exercises actual DuckDB trace pagination and latest-summary behavior; a live test Scope joins worker close before removing its private root. */
import { it } from "@effect/vitest";
import { Effect } from "effect";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLocalWorker } from "../src/local/worker-client.js";
import { tracePageRecords } from "./local-trace-pages-fixture.js";
import { verifyTracePages } from "./local-trace-pages-assertions.js";

it.live(
  "trace details expose every retained span through stable pages and the latest summary",
  () =>
    Effect.gen(function* () {
      const root = yield* Effect.acquireRelease(
        Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-trace-pages-"))),
        (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
      );
      const worker = yield* Effect.acquireRelease(
        Effect.sync(() => startLocalWorker()),
        (worker) => Effect.promise(() => worker.close()),
      );
      const records = tracePageRecords(new Date().toISOString());
      yield* Effect.promise(() => worker.call({ type: "open", root }));
      yield* Effect.promise(() => worker.call({ type: "append", records }));
      yield* verifyTracePages(worker);
    }),
  30_000,
);
