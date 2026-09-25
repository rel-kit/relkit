import { expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Exit, Layer, Scope, Semaphore } from "effect";
import { openDuckdbDatabaseEffect } from "../src/local/duckdb-database-effect.js";
import { DuckdbDriverService } from "../src/local/duckdb-driver.js";
import type { DuckdbConnectionPort, DuckdbInstancePort } from "../src/local/duckdb-driver.types.js";
import { makeDuckdbStorage } from "../src/local/duckdb-storage.js";
test("append transaction and query share one native connection permit", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-duckdb-concurrency-"));
  const events: string[] = [];
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  let holdBegin = false;
  let active = 0;
  let peak = 0;
  const enter = async <T>(label: string, result: T): Promise<T> => {
    events.push(label);
    active++;
    peak = Math.max(peak, active);
    if (holdBegin && label === "BEGIN TRANSACTION") {
      started();
      await gate;
    }
    active--;
    return result;
  };
  const connection: DuckdbConnectionPort = {
    run: (sql) => enter(sql, undefined),
    runAndReadAll: (sql) =>
      enter(sql, {
        getRowObjectsJson: () =>
          sql.includes("pragma_table_info")
            ? [{ name: "origin_request_id" }, { name: "span_id" }]
            : sql.includes("RETURNING key")
              ? [{ key: "ordered" }]
              : sql.includes("RETURNING id")
                ? [{ id: "1" }]
                : [],
      }),
    closeSync: () => undefined,
  };
  const instance: DuckdbInstancePort = {
    connect: async () => connection,
    closeSync: () => undefined,
  };
  const layer = Layer.succeed(
    DuckdbDriverService,
    DuckdbDriverService.of({
      create: () => Effect.succeed(instance),
    }),
  );
  const scope = Effect.runSync(Scope.make());
  try {
    await writeFile(join(root, "observability.duckdb"), "");
    const database = await Effect.runPromise(
      openDuckdbDatabaseEffect(root).pipe(Scope.provide(scope), Effect.provide(layer)),
    );
    events.length = 0;
    peak = 0;
    holdBegin = true;
    const append = Effect.runPromise(
      database.append([
        {
          key: "ordered",
          origin: "application",
          record: {
            version: 2,
            signal: "log",
            timestamp: "2026-09-25T00:00:00.000Z",
            level: "info",
            component: "test",
            message: "ordered",
          },
        },
      ]),
    );
    await began;
    const query = Effect.runPromise(database.list("logs"));
    release();
    const [stored, page] = await Promise.all([append, query]);
    expect(stored).toHaveLength(1);
    expect(page.items).toHaveLength(0);
    expect(peak).toBe(1);
    expect(events.indexOf("COMMIT")).toBeLessThan(
      events.findIndex((item) => item.includes("SELECT id::VARCHAR")),
    );
  } finally {
    release();
    await Effect.runPromise(Scope.close(scope, Exit.void));
    await rm(root, { recursive: true, force: true });
  }
});
test("commit failure attempts rollback and remains a tagged storage failure", async () => {
  const commands: string[] = [];
  const connection: DuckdbConnectionPort = {
    run: async (sql) => {
      commands.push(sql);
      if (sql === "COMMIT") throw new Error("commit failed");
    },
    runAndReadAll: async (sql) => ({
      getRowObjectsJson: () =>
        sql.includes("RETURNING key")
          ? [{ key: "commit-test" }]
          : sql.includes("RETURNING id")
            ? [{ id: "1" }]
            : [],
    }),
    closeSync: () => undefined,
  };
  const storage = makeDuckdbStorage(connection, Semaphore.makeUnsafe(1), {});
  const result = await Effect.runPromise(
    Effect.result(
      storage.append([
        {
          key: "commit-test",
          origin: "application",
          record: {
            version: 2,
            signal: "log",
            timestamp: "2026-09-25T00:00:00.000Z",
            level: "info",
            component: "test",
            message: "commit",
          },
        },
      ]),
    ),
  );
  expect(result).toMatchObject({
    _tag: "Failure",
    failure: {
      _tag: "DuckdbError",
      operation: "commit",
      message: "commit failed",
    },
  });
  expect(commands.at(-2)).toBe("COMMIT");
  expect(commands.at(-1)).toBe("ROLLBACK");
});
