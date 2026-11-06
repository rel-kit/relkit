import {
  load,
  makeDescriptors,
  printPerformanceReport,
  root,
  round,
  scales,
  type PerformanceRecord,
} from "./performance-support.js";
import { measureInstrumentation } from "./performance-instrumentation.js";
import { measureWorkloads } from "./performance-workloads.js";

async function main(): Promise<void> {
  const [
    contracts,
    compiler,
    functions,
    schema,
    engine,
    events,
    runtime,
    testing,
    supervisor,
    observability,
    layoutModule,
  ] = await Promise.all([
    load("packages/relkit/src/contracts/index.ts"),
    load("packages/cli/src/compiler/index.ts"),
    load("packages/relkit/src/functions/index.ts"),
    load("packages/relkit/src/schema/index.ts"),
    load("packages/relkit/src/engine/index.ts"),
    load("packages/relkit/src/events/index.ts"),
    load("packages/relkit/src/runtime-hono/index.ts"),
    load("packages/testing/src/index.ts"),
    load("packages/cli/src/supervisor/index.ts"),
    load("packages/relkit/src/observability/index.ts"),
    load("apps/inspector/lib/graph-layout.ts"),
  ]);
  const modules = {
    contracts,
    schema,
    engine,
    events,
    runtime,
    testing,
    supervisor,
    observability,
    layoutModule,
  };
  const compile = compiler.normalizeCompilation as (input: PerformanceRecord) => PerformanceRecord;
  const compilation = scales.map((descriptors) => {
    const fixture = makeDescriptors(descriptors, functions.defineFunction, schema.z);
    const before = process.memoryUsage().heapUsed;
    const started = performance.now();
    const result = compile({ descriptors: fixture, projectRoot: root });
    const totalMs = performance.now() - started;
    if (!result.activatable || result.graph === undefined)
      throw new Error("Compiler fixture failed");
    return {
      descriptors,
      totalMs: round(totalMs),
      graphNodes: result.graph.nodes.length,
      graphBytes: new TextEncoder().encode(result.outputs.graph).byteLength,
      heapDeltaBytes: process.memoryUsage().heapUsed - before,
      graphHash: result.graphHash,
    };
  });
  printPerformanceReport({
    compilation,
    ...(await measureWorkloads(modules)),
    ...(await measureInstrumentation(modules)),
  });
}

await main();
