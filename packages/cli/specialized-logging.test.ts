import { expect, test } from "bun:test";
import { Context, Effect } from "effect";
import { GRAPH_VERSION } from "@relkit/contracts";
import { createObservabilityCollector } from "@relkit/observability";
import { createLoggerLayer, type LogRecord } from "@relkit/runtime-effect";
import { serverSource } from "./src/commands/build-server.js";
import { createDevLogger } from "./src/commands/dev-logger.js";

test("generated specialized debug logs reach the configured dev sink with retained annotations", async () => {
  const source = serverSource(
    { contractVersion: GRAPH_VERSION, appId: "test", nodes: [], edges: [] },
    "sha256:graph",
    {
      graphHash: "sha256:graph",
      manifestHash: "sha256:manifest",
      runtimeIntegrationsPlanHash: "sha256:integrations",
    },
  );
  const start = source.indexOf("const specializedInstrumentation =");
  const end = source.indexOf("const databaseStartup =", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const capture = new Function(
    "Effect",
    "createLoggerLayer",
    "process",
    "telemetry",
    "writeRuntimeLog",
    `return (async () => {
      const generationId = "generation", graphHash = "sha256:graph";
      ${source.slice(start, end)}
      return specializedInstrumentation;
    })();`,
  ) as (...args: unknown[]) => Promise<Context.Context<never>>;
  const forwarded: LogRecord[] = [];
  const instrumentation = await capture(
    Effect,
    createLoggerLayer,
    { env: { RELKIT_DEV_LOGS: "1" } },
    createObservabilityCollector(),
    (record: LogRecord) => forwarded.push(record),
  );
  await Effect.runPromise(
    Effect.logDebug("database.interrupted").pipe(Effect.provide(instrumentation)),
  );
  expect(forwarded).toHaveLength(1);
  expect(forwarded[0]).toMatchObject({
    level: "debug",
    generationId: "generation",
    graphHash: "sha256:graph",
    source: "direct",
  });
  for (const minimumLevel of ["debug", "info", "none"] as const) {
    const visible: LogRecord[] = [];
    const log = createDevLogger({
      compile: async () => undefined,
      logger: { minimumLevel, human: false, json: { write: (record) => visible.push(record) } },
    });
    log({
      level: "info",
      event: "candidate.startup-output",
      fields: {
        output: `\u001e${JSON.stringify(forwarded[0])}`,
      },
    });
    expect(visible).toHaveLength(minimumLevel === "debug" ? 1 : 0);
  }
  const production: LogRecord[] = [];
  const productionContext = await capture(
    Effect,
    createLoggerLayer,
    { env: {} },
    createObservabilityCollector(),
    (record: LogRecord) => production.push(record),
  );
  await Effect.runPromise(
    Effect.logDebug("database.interrupted").pipe(Effect.provide(productionContext)),
  );
  expect(production).toHaveLength(0);
});
