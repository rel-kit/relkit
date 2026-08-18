import {
  environment,
  invocationOptions,
  load,
  makeDescriptors,
  makeRoutePlan,
  manifest,
  measure,
  repeat,
  root,
  round,
  scales,
  type R,
} from "./performance-support.js";

async function main(): Promise<void> {
  const [compiler, functions, schema, engine, runtime, testing, supervisor, layoutModule] =
    await Promise.all([
      load("packages/compiler/src/index.ts"),
      load("packages/functions/src/index.ts"),
      load("packages/schema/src/index.ts"),
      load("packages/engine/src/index.ts"),
      load("packages/runtime-hono/src/index.ts"),
      load("packages/testing/src/index.ts"),
      load("packages/supervisor/src/index.ts"),
      load("apps/inspector/lib/graph-layout.ts"),
    ]);
  const z = schema.z;
  const compile = compiler.normalizeCompilation as (input: R) => R;
  const compilation = scales.map((descriptors) => {
    const fixture = makeDescriptors(descriptors, functions.defineFunction, z);
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
  const io = z.object({ value: z.string() });
  const invokeFunction = engine.invokeFunction as (
    target: R,
    input: unknown,
    options: R,
  ) => Promise<unknown>;
  const directTarget = { id: "bench.direct", input: io, output: io, handler: (value: R) => value };
  const warmDirectInvocation = await measure(100, async (index) => {
    await invokeFunction(directTarget, { value: String(index) }, invocationOptions("direct"));
  });
  const routeTarget = { ...directTarget, id: "bench.route" };
  const routePlan = makeRoutePlan(routeTarget.id);
  const routeApp = runtime.createApp({
    plan: routePlan,
    manifest: manifest(routePlan.graphHash),
    engine: {
      invoke: ({ input, source }: R) =>
        invokeFunction(routeTarget, input, invocationOptions(source)),
    },
  });
  const warmRoute = await measure(100, async (index) => {
    const response = await routeApp.request(`http://localhost/bench/${index}`);
    if (response.status !== 200) throw new Error(`Route fixture returned ${response.status}`);
    await response.text();
  });
  const streamEvents = Array.from({ length: 4 }, (_, index) => ({
    cursor: `cursor-${index}`,
    type: "request.completed",
    data: { requestId: `request-${index}`, outcome: "success" },
  }));
  const streamApp = runtime.createApp({
    plan: routePlan,
    manifest: manifest(routePlan.graphHash),
    engine: { invoke: async () => ({}) },
    internalEndpoints: { mode: "test", stream: streamEvents },
  });
  const requestStream = await measure(100, async () => {
    const response = await streamApp.request("http://localhost/_zsys/v1/stream?limit=4");
    if (response.status !== 200 || !(await response.text()).includes("data:"))
      throw new Error("Stream fixture failed");
  });

  const jobSchema = z.object({ value: z.number() });
  const job = await testing.createTestJob({
    jobId: "bench.job",
    target: { id: "bench.job", input: jobSchema, output: jobSchema, handler: (value: R) => value },
  });
  const jobStarted = performance.now();
  await repeat(100, (index) => job.enqueue({ value: index }));
  const jobResults = await job.drain();
  const jobMs = performance.now() - jobStarted;
  if (jobResults.length !== 100) throw new Error("Job fixture did not drain");
  await job.close();

  const event = await testing.createTestEvent({
    eventId: "bench.event",
    version: 1,
    payloadSchema: jobSchema,
    triggers: Array.from({ length: 8 }, (_, index) => ({
      id: `bench.event.trigger.${index}`,
      delivery: "ephemeral",
      target: {
        id: `bench.event.handler.${index}`,
        input: z.unknown(),
        output: z.unknown(),
        handler: async () => ({ ok: true }),
      },
    })),
  });
  const eventStarted = performance.now();
  await repeat(100, (index) => event.publish({ value: index }));
  const eventMs = performance.now() - eventStarted;
  const completed = event.completed();
  if (completed !== 800) throw new Error(`Event fan-out completed ${completed} deliveries`);
  await event.close();

  const layout = layoutModule.layoutGraph as (graph: R) => R;
  const nodes = Array.from({ length: 1_000 }, (_, index) => ({
    id: `node.${index}`,
    kind: "function",
  }));
  const edges = nodes.slice(1).map((node, index) => ({
    relationship: "declared",
    kind: "calls",
    from: nodes[index].id,
    to: node.id,
  }));
  const layoutStarted = performance.now();
  const graphLayout = layout({
    generationId: "bench",
    graphHash: "sha256:performance",
    nodes,
    declaredEdges: edges,
    observedEdges: [],
  });
  const layoutMs = performance.now() - layoutStarted;
  if (graphLayout.nodes.length !== 1_000)
    throw new Error("Inspector fixture did not layout 1,000 nodes");

  const createSupervisor = supervisor.createSupervisorStateMachine as () => R;
  const candidateActivation = await measure(100, async () => {
    const machine = createSupervisor();
    const token = machine.requestSourceChange();
    machine.compileSucceeded(token);
    machine.startSucceeded(token);
    machine.verificationSucceeded(token);
    machine.switchSucceeded(token);
    if (machine.state !== "active") throw new Error("Candidate fixture did not activate");
  });

  const measurements = {
    compilation,
    warmDirectInvocation,
    warmRoute,
    requestStream,
    localJob: {
      iterations: 100,
      completed: jobResults.length,
      totalMs: round(jobMs),
      opsPerSecond: round(100_000 / jobMs),
    },
    eventFanOut: {
      iterations: 100,
      fanOut: 8,
      completed,
      totalMs: round(eventMs),
      eventsPerSecond: round(100_000 / eventMs),
    },
    inspectorGraph: {
      nodes: graphLayout.nodes.length,
      edges: graphLayout.edges.length,
      totalMs: round(layoutMs),
      width: graphLayout.width,
      height: graphLayout.height,
    },
    candidateActivation,
  };
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

await main();
