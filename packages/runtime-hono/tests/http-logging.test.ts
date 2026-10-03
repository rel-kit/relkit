import { expect, it } from "@effect/vitest";
import { Effect, Fiber, Logger, Metric, References } from "effect";
import { createObservabilityCollector, isRedactedObservabilityRecord } from "@relkit/observability";
import { Hono } from "hono";
import { createLoggerLayer, type LogRecord } from "@relkit/runtime-effect";
import { installHttpLogging } from "../src/http-logging.js";
import { httpBoundary, observeHttp, runHttp } from "../src/http-effect.js";

it("routes native request logs to the existing collector and respects its minimum level", async () => {
  const records: LogRecord[] = [];
  const app = new Hono();
  installHttpLogging(app, {
    observability: {
      collect: (record) => {
        if (record.signal === "log") records.push(record);
      },
    },
    effectLogger: { minimumLevel: "warn" },
  });
  app.get("/", async (context) => {
    await runHttp(
      Effect.gen(function* () {
        yield* Effect.logInfo("hidden");
        yield* Effect.logWarning("request recovery");
      }),
    );
    return context.text("ok");
  });
  expect((await app.request("http://fixture/")).status).toBe(200);
  expect(records.map((record) => record.message)).toEqual(["request recovery"]);
});

it.each(["throw", "reject", "then-getter"])(
  "isolates %s collector failures from requests",
  async (failure) => {
    const app = new Hono();
    let calls = 0;
    installHttpLogging(app, {
      observability: {
        collect: () => {
          calls++;
          if (failure === "throw") throw new Error("collector offline");
          if (failure === "reject") return Promise.reject(new Error("collector offline"));
          return Object.defineProperty({}, "then", {
            get: () => {
              throw new Error("collector then getter failed");
            },
          });
        },
      },
    });
    app.get("/", async (context) => {
      await runHttp(Effect.logWarning("recovering"));
      return context.text("ok");
    });
    expect(await (await app.request("http://fixture/")).text()).toBe("ok");
    expect(calls).toBe(1);
  },
);

it("admits actual lifecycle logs without an implicit retention collector", async () => {
  /**
   * Reads collector operations to detect accidental private buffer allocation or retention.
   * @param operation - Collector operation whose count is compared across a request.
   * @returns The current count in the native compatibility runner's metric registry.
   */
  const collectorCount = (operation: "create" | "collect") =>
    Effect.runSync(
      Metric.value(
        Metric.counter("relkit_observability_collector_operations_total", {
          attributes: { operation, outcome: "success" },
        }),
      ),
    ).count;
  const before = [collectorCount("create"), collectorCount("collect")];
  const records: LogRecord[] = [];
  const app = new Hono();
  installHttpLogging(app, {
    observability: {
      collect: (record) => {
        if (record.signal === "log") records.push(record);
      },
    },
  });
  app.get("/", async (context) => {
    await runHttp(
      observeHttp("fixture.admission", Effect.succeed("ok")).pipe(
        Effect.annotateLogs({ authorization: "Bearer private-secret" }),
      ),
    );
    return context.text("ok");
  });
  expect(await (await app.request("http://fixture/")).text()).toBe("ok");
  expect([collectorCount("create"), collectorCount("collect")]).toEqual(before);
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    level: "info",
    message: "Execution operation completed",
    fields: { domain: "http", operation: "fixture.admission", outcome: "success" },
  });
  expect(isRedactedObservabilityRecord(records[0])).toBe(true);
  expect(JSON.stringify(records)).not.toContain("private-secret");
});

it("preserves explicit collectors and custom redaction before delivering the same admitted record", async () => {
  const collector = createObservabilityCollector();
  const records: LogRecord[] = [];
  const app = new Hono();
  installHttpLogging(app, {
    observability: {
      collect: (record) => {
        if (record.signal === "log") records.push(record);
      },
    },
    effectLogger: {
      collector,
      redact: (record) => ({ ...record, fields: { marker: "custom policy" } }),
    },
  });
  app.get("/", async (context) => {
    await runHttp(Effect.logInfo("custom admission"));
    return context.text("ok");
  });
  expect((await app.request("http://fixture/")).status).toBe(200);
  expect(records).toHaveLength(1);
  expect(collector.read()).toEqual(records);
  expect(collector.read()[0]).toBe(records[0]);
  expect(records[0]?.fields).toEqual({ marker: "custom policy" });
  expect(isRedactedObservabilityRecord(records[0])).toBe(true);
});

it.effect(
  "retains child overrides through native callbacks without leaking to parent or sibling",
  () => {
    const records: LogRecord[] = [];
    const native = (message: string) =>
      httpBoundary("fixture.native", () => runHttp(Effect.logDebug(message)));
    return Effect.gen(function* () {
      const child = yield* native("child").pipe(
        Effect.provideService(References.MinimumLogLevel, "Debug"),
        Effect.forkChild,
      );
      yield* Fiber.join(child);
      yield* native("parent");
      const sibling = yield* Effect.forkChild(native("sibling"));
      yield* Fiber.join(sibling);
      expect(records.map((record) => record.message)).toEqual(["child"]);
      expect(records[0]?.requestId).toBe("request-1");
    }).pipe(
      Effect.annotateLogs({ requestId: "request-1" }),
      Effect.provide(
        createLoggerLayer({
          minimumLevel: "warn",
          human: false,
          json: { write: (record) => records.push(record) },
        }),
      ),
    );
  },
);

it.effect("reports a standalone typed failure and recovery with redacted fields", () => {
  const records: LogRecord[] = [];
  return observeHttp("fixture.failure", Effect.fail("expected")).pipe(
    Effect.catch(() => Effect.logWarning("request recovered")),
    Effect.annotateLogs({ authorization: "Bearer private-secret" }),
    Effect.provide(
      createLoggerLayer({ human: false, json: { write: (record) => records.push(record) } }),
    ),
    Effect.tap(() =>
      Effect.sync(() => {
        expect(records.some((record) => record.level === "error")).toBe(true);
        expect(records.some((record) => record.message === "request recovered")).toBe(true);
        expect(JSON.stringify(records)).not.toContain("private-secret");
      }),
    ),
  );
});

it.effect("preserves explicit platform and mixed logger sets through native runners", () =>
  Effect.gen(function* () {
    const custom = Logger.make(() => undefined);
    for (const loggers of [
      new Set([Logger.defaultLogger]),
      new Set([Logger.defaultLogger, custom]),
    ]) {
      const inherited = yield* httpBoundary("fixture.loggerContext", () =>
        runHttp(Effect.service(Logger.CurrentLoggers)),
      ).pipe(Effect.provideService(Logger.CurrentLoggers, loggers));
      expect(inherited).toBe(loggers);
    }
  }),
);

it("uses app logging when a native caller has only implicit Effect defaults", async () => {
  const records: LogRecord[] = [];
  const app = new Hono();
  installHttpLogging(app, {
    observability: {
      collect: (record) => {
        if (record.signal === "log") records.push(record);
      },
    },
  });
  app.get("/", async (context) => {
    await runHttp(Effect.logInfo("app boundary"));
    return context.text("ok");
  });
  await Effect.runPromise(Effect.promise(() => Promise.resolve(app.request("http://fixture/"))));
  expect(records.map((record) => record.message)).toEqual(["app boundary"]);
});
