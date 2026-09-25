import { expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Exit, Layer, Scope } from "effect";
import { DuckdbDriverService } from "../src/local/duckdb-driver.js";
import type { DuckdbConnectionPort, DuckdbInstancePort } from "../src/local/duckdb-driver.types.js";
import { DuckdbWorkerService, duckdbWorkerLayer } from "../src/local/duckdb-worker-effect.js";
import { startDuckdbWorkerProcessEffect } from "../src/local/duckdb-worker-process.js";
test("worker Layer serializes commands and releases its database at scope exit", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-worker-effect-"));
  const releases: string[] = [];
  try {
    await writeFile(join(root, "observability.duckdb"), "");
    const connection: DuckdbConnectionPort = {
      run: async () => undefined,
      runAndReadAll: async (sql) => ({
        getRowObjectsJson: () =>
          sql.includes("pragma_table_info")
            ? [{ name: "origin_request_id" }, { name: "span_id" }]
            : [],
      }),
      closeSync: () => {
        releases.push("connection");
      },
    };
    const instance: DuckdbInstancePort = {
      connect: async () => connection,
      closeSync: () => {
        releases.push("instance");
      },
    };
    const driver = Layer.succeed(
      DuckdbDriverService,
      DuckdbDriverService.of({
        create: () => Effect.succeed(instance),
      }),
    );
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const worker = yield* DuckdbWorkerService;
        expect(yield* worker.execute({ type: "open", root })).toEqual({ records: 0, malformed: 0 });
        expect(yield* worker.execute({ type: "flush" })).toBeUndefined();
        return yield* Effect.result(worker.execute({ type: "open", root }));
      }).pipe(Effect.provide(duckdbWorkerLayer.pipe(Layer.provide(driver)))),
    );
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "DuckdbError",
        operation: "open",
      },
    });
    expect(releases).toEqual(["connection", "instance"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("worker process listeners and timer leave with their Scope", async () => {
  const events = ["message", "disconnect", "SIGINT"] as const;
  const before = events.map((event) => process.listenerCount(event));
  const scope = Effect.runSync(Scope.make());
  await Effect.runPromise(startDuckdbWorkerProcessEffect().pipe(Scope.provide(scope)));
  expect(events.map((event) => process.listenerCount(event))).toEqual(
    before.map((count) => count + 1),
  );
  await Effect.runPromise(Scope.close(scope, Exit.void));
  await Effect.runPromise(Scope.close(scope, Exit.void));
  expect(events.map((event) => process.listenerCount(event))).toEqual(before);
});
