import { expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Fiber, Layer, Metric } from "effect";
import {
  DuckdbDatabaseService,
  duckdbDatabaseLayer,
  openDuckdbDatabaseEffect,
} from "../src/local/duckdb-database-effect.js";
import { DuckdbDriverService } from "../src/local/duckdb-driver.js";
import type { DuckdbConnectionPort, DuckdbInstancePort } from "../src/local/duckdb-driver.types.js";
function connection(releases: string[], compatible = true): DuckdbConnectionPort {
  return {
    run: async () => undefined,
    runAndReadAll: async (sql) => ({
      getRowObjectsJson: () =>
        sql.includes("pragma_table_info") && compatible
          ? [{ name: "origin_request_id" }, { name: "span_id" }]
          : [],
    }),
    closeSync: () => {
      releases.push("connection");
    },
  };
}
test("database Layer releases connection before instance on successful scope close", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-duckdb-effect-"));
  const releases: string[] = [];
  const registry = new Map();
  try {
    await writeFile(join(root, "observability.duckdb"), "");
    const instance: DuckdbInstancePort = {
      connect: async () => connection(releases),
      closeSync: () => {
        releases.push("instance");
      },
    };
    const layer = Layer.succeed(
      DuckdbDriverService,
      DuckdbDriverService.of({
        create: () => Effect.succeed(instance),
      }),
    );
    const count = await Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* DuckdbDatabaseService;
        expect(database.imported).toEqual({ records: 0, malformed: 0 });
        yield* database.flush();
        return yield* Metric.value(
          Metric.counter("relkit_observability_duckdb_operations_total", {
            attributes: { operation: "open", outcome: "success" },
          }),
        );
      }).pipe(
        Effect.provide(duckdbDatabaseLayer(root).pipe(Layer.provide(layer))),
        Effect.provideService(Metric.MetricRegistry, registry),
      ),
    );
    expect(count.count).toBe(1);
    expect(releases).toEqual(["connection", "instance"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("schema failure releases both partially acquired handles", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-duckdb-effect-invalid-"));
  const releases: string[] = [];
  try {
    await writeFile(join(root, "observability.duckdb"), "");
    const instance: DuckdbInstancePort = {
      connect: async () => connection(releases, false),
      closeSync: () => {
        releases.push("instance");
      },
    };
    const layer = Layer.succeed(
      DuckdbDriverService,
      DuckdbDriverService.of({
        create: () => Effect.succeed(instance),
      }),
    );
    const result = await Effect.runPromise(
      Effect.scoped(openDuckdbDatabaseEffect(root).pipe(Effect.provide(layer), Effect.result)),
    );
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "DuckdbError", operation: "schema" },
    });
    expect(releases).toEqual(["connection", "instance"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("connection acquisition failure releases the instance", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-duckdb-effect-connect-failure-"));
  const releases: string[] = [];
  try {
    await writeFile(join(root, "observability.duckdb"), "");
    const instance: DuckdbInstancePort = {
      connect: async () => {
        throw new Error("connection failed");
      },
      closeSync: () => {
        releases.push("instance");
      },
    };
    const layer = Layer.succeed(
      DuckdbDriverService,
      DuckdbDriverService.of({
        create: () => Effect.succeed(instance),
      }),
    );
    const result = await Effect.runPromise(
      Effect.scoped(openDuckdbDatabaseEffect(root).pipe(Effect.provide(layer), Effect.result)),
    );
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "DuckdbError",
        operation: "connect",
      },
    });
    expect(releases).toEqual(["instance"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("interrupting connection acquisition releases the acquired instance", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-duckdb-effect-interrupt-"));
  const releases: string[] = [];
  let started!: () => void;
  let complete!: (value: DuckdbConnectionPort) => void;
  const connecting = new Promise<void>((resolve) => {
    started = resolve;
  });
  try {
    await writeFile(join(root, "observability.duckdb"), "");
    const instance: DuckdbInstancePort = {
      connect: () => {
        started();
        return new Promise<DuckdbConnectionPort>((resolve) => {
          complete = resolve;
        });
      },
      closeSync: () => {
        releases.push("instance");
      },
    };
    const layer = Layer.succeed(
      DuckdbDriverService,
      DuckdbDriverService.of({
        create: () => Effect.succeed(instance),
      }),
    );
    const fiber = Effect.runFork(
      Effect.scoped(openDuckdbDatabaseEffect(root).pipe(Effect.provide(layer))),
    );
    await connecting;
    const interrupted = Effect.runPromise(Fiber.interrupt(fiber));
    await Promise.resolve();
    complete(connection(releases));
    await interrupted;
    expect(releases).toEqual(["connection", "instance"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
