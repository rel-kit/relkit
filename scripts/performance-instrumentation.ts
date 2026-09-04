import {
  invocationOptions,
  makeManifest,
  makeRoutePlan,
  measure,
  percent,
  repeat,
  type PerformanceRecord,
} from "./performance-support.js";

export async function measureInstrumentation(modules: PerformanceRecord) {
  const { contracts, schema, engine, runtime, observability } = modules;
  const io = schema.z.object({ value: schema.z.string() });
  const invokeFunction = engine.invokeFunction as (
    target: PerformanceRecord,
    input: unknown,
    options: PerformanceRecord,
  ) => Promise<unknown>;
  const target = {
    id: "bench.direct",
    input: io,
    output: io,
    handler: (value: PerformanceRecord) => value,
  };
  const observedOptions = (source: string): PerformanceRecord => ({
    ...invocationOptions(source),
    hooks: { onSpanComplete: () => undefined },
  });
  const directBaseline = await measure(1_000, async (index) => {
    await invokeFunction(target, { value: String(index) }, invocationOptions("direct"));
  });
  const directRecorded = await measure(1_000, async (index) => {
    await invokeFunction(target, { value: String(index) }, observedOptions("direct"));
  });
  const operationTarget = {
    ...target,
    id: "bench.operations",
    handler: async (value: PerformanceRecord, context: PerformanceRecord) => {
      for (let index = 0; index < 10; index += 1)
        await context.trace.span(`bench.operation.${index}`, async () => undefined);
      return value;
    },
  };
  const operationBaseline = await measure(1_000, async (index) => {
    await invokeFunction(operationTarget, { value: String(index) }, invocationOptions("direct"));
  });
  const operationRecorded = await measure(1_000, async (index) => {
    await invokeFunction(operationTarget, { value: String(index) }, observedOptions("direct"));
  });

  const routeTarget = { ...target, id: "bench.route" };
  const plan = makeRoutePlan(routeTarget.id);
  const manifest = makeManifest(contracts, plan.graphHash);
  const app = (recording: boolean) =>
    runtime.createApp({
      plan,
      manifest,
      ...(recording ? { observability: { collect: () => undefined } } : {}),
      engine: {
        invoke: ({ input, source }: PerformanceRecord) =>
          invokeFunction(
            routeTarget,
            input,
            recording ? observedOptions(source) : invocationOptions(source),
          ),
      },
    });
  const routeBaselineApp = app(false);
  const routeRecordedApp = app(true);
  const routeBaseline = await measure(1_000, async (index) => {
    await (await routeBaselineApp.request(`http://localhost/bench/${index}`)).text();
  });
  const routeRecorded = await measure(1_000, async (index) => {
    await (await routeRecordedApp.request(`http://localhost/bench/${index}`)).text();
  });

  const requestId = "request-performance";
  const traceId = "20000000000000000000000000000002";
  const queryRecords: PerformanceRecord[] = [
    {
      version: 2,
      signal: "request",
      phase: "completed",
      requestId,
      originRequestId: requestId,
      traceId,
      generationId: "generation-performance",
      graphHash: "sha256:performance",
      startedAt: "2026-09-03T00:00:00.000Z",
      completedAt: "2026-09-03T00:00:01.000Z",
      durationMs: 1_000,
      method: "GET",
      rawPath: "/bench",
      outcome: "success",
      status: 200,
    },
  ];
  for (let index = 1; index <= 512; index += 1)
    queryRecords.push({
      version: 2,
      signal: "span",
      traceId,
      spanId: index.toString(16).padStart(16, "0"),
      name: `bench.query.${index}`,
      kind: "internal",
      status: "completed",
      revision: 1,
      startedAt: "2026-09-03T00:00:00.000Z",
      completedAt: "2026-09-03T00:00:00.001Z",
      durationMs: 1,
      outcome: "success",
      requestId,
      originRequestId: requestId,
    });
  const executionQuery = await measure(100, async () => {
    if (observability.assembleRequestExecution(queryRecords, requestId)?.spans.length !== 512)
      throw new Error("Execution query fixture failed");
  });
  Bun.gc(true);
  const heapBefore = process.memoryUsage().heapUsed;
  await repeat(2_000, (index) =>
    invokeFunction(target, { value: String(index) }, observedOptions("direct")),
  );
  Bun.gc(true);
  const heapAfter = process.memoryUsage().heapUsed;
  const overhead = (baseline: PerformanceRecord, recorded: PerformanceRecord) => ({
    baseline,
    recorded,
    p50Percent: percent(baseline.p50Ms, recorded.p50Ms),
    p95Percent: percent(baseline.p95Ms, recorded.p95Ms),
  });
  return {
    instrumentationOverhead: {
      directInvocation: overhead(directBaseline, directRecorded),
      operationHeavyInvocation: overhead(operationBaseline, operationRecorded),
      httpRoute: overhead(routeBaseline, routeRecorded),
    },
    executionQuery,
    heapStabilization: {
      iterations: 2_000,
      beforeBytes: heapBefore,
      afterBytes: heapAfter,
      deltaBytes: heapAfter - heapBefore,
    },
  };
}
