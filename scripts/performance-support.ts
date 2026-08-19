import { arch, cpus, platform, release, totalmem } from "node:os";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

export type PerformanceRecord = Record<string, any>;
export const root = resolve(import.meta.dir, "..");
export const scales = [100, 1_000, 10_000] as const;
export const round = (value: number): number => Number(value.toFixed(3));
export const load = async (path: string): Promise<PerformanceRecord> =>
  (await import(pathToFileURL(resolve(root, path)).href)) as PerformanceRecord;

export async function repeat(
  count: number,
  operation: (index: number) => Promise<unknown>,
): Promise<void> {
  for (let index = 0; index < count; index += 1) await operation(index);
}

function summarize(
  iterations: number,
  totalMs: number,
  durations: number[],
  warmups: number,
): PerformanceRecord {
  const sorted = [...durations].sort((left, right) => left - right);
  const percentile = (value: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * value))] ?? 0;
  return {
    iterations,
    warmups,
    totalMs: round(totalMs),
    averageMs: round(totalMs / iterations),
    p50Ms: round(percentile(0.5)),
    p95Ms: round(percentile(0.95)),
    opsPerSecond: round((iterations * 1_000) / totalMs),
  };
}

export async function measure(
  iterations: number,
  operation: (index: number) => Promise<void>,
): Promise<PerformanceRecord> {
  const warmups = 10;
  await repeat(warmups, operation);
  const durations: number[] = [];
  const started = performance.now();
  await repeat(iterations, async (index) => {
    const operationStarted = performance.now();
    await operation(index);
    durations.push(performance.now() - operationStarted);
  });
  return summarize(iterations, performance.now() - started, durations, warmups);
}

export function makeDescriptors(
  count: number,
  defineFunction: PerformanceRecord["defineFunction"],
  z: PerformanceRecord["z"],
): unknown[] {
  const schema = z.object({ value: z.number() });
  return Array.from({ length: count }, (_, index) =>
    defineFunction({
      id: `bench.function.${index}`,
      input: schema,
      output: schema,
      handler: (value: PerformanceRecord) => value,
    }),
  );
}

export const manifest = (graphHash: string): PerformanceRecord => ({
  contractVersion: 1,
  generatorVersion: 1,
  graphHash,
  functions: {},
  middleware: {},
  requestTransforms: {},
});

export function makeRoutePlan(targetFunctionId: string): PerformanceRecord {
  const source = { file: "scripts/performance.ts", line: 1, column: 1 };
  return {
    graphHash: "sha256:performance",
    functions: [],
    httpTriggers: [
      {
        kind: "trigger",
        id: "bench.route",
        source,
        triggerType: "http",
        targetFunctionId,
        config: {
          method: "GET",
          path: "/bench/:value",
          request: { kind: "input", fields: { value: { kind: "path", name: "value" } } },
          responses: [],
          middleware: [],
          transforms: [],
        },
      },
    ],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    agents: [],
  };
}

export function invocationOptions(source: string): PerformanceRecord {
  return { source, now: () => 0, idSource: { next: (kind: string) => `${kind}-1` } };
}

export function environment(): PerformanceRecord {
  return {
    command: "bun run scripts/performance.ts",
    timestamp: new Date().toISOString(),
    bun: Bun.version,
    node: process.version,
    platform: platform(),
    arch: arch(),
    os: release(),
    cpuModel: cpus()[0]?.model ?? "unknown",
    cpuCount: cpus().length,
    totalMemoryBytes: totalmem(),
  };
}

export function printPerformanceReport(measurements: PerformanceRecord): void {
  console.log(
    JSON.stringify(
      {
        protocol: "zsys.performance",
        version: 1,
        environment: environment(),
        fixtures: { descriptorScales: scales, inspectorNodes: 1_000, eventFanOut: 8 },
        measurements,
        thresholds: null,
      },
      null,
      2,
    ),
  );
}
