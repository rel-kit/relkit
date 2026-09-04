import {
  invocationOptions,
  makeManifest,
  makeRoutePlan,
  measure,
  repeat,
  round,
  type PerformanceRecord,
} from "./performance-support.js";

export async function measureWorkloads(modules: PerformanceRecord): Promise<PerformanceRecord> {
  const { contracts, schema, engine, events, runtime, testing, supervisor, layoutModule } = modules;
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
  const warmDirectInvocation = await measure(100, async (index) => {
    await invokeFunction(target, { value: String(index) }, invocationOptions("direct"));
  });
  const routeTarget = { ...target, id: "bench.route" };
  const routePlan = makeRoutePlan(routeTarget.id);
  const manifest = makeManifest(contracts, routePlan.graphHash);
  const routeApp = runtime.createApp({
    plan: routePlan,
    manifest,
    engine: {
      invoke: ({ input, source }: PerformanceRecord) =>
        invokeFunction(routeTarget, input, invocationOptions(source)),
    },
  });
  const warmRoute = await measure(100, async (index) => {
    const response = await routeApp.request(`http://localhost/bench/${index}`);
    if (response.status !== 200) throw new Error(`Route fixture returned ${response.status}`);
    await response.text();
  });
  const streamApp = runtime.createApp({
    plan: routePlan,
    manifest,
    engine: { invoke: async () => ({}) },
    internalEndpoints: {
      mode: "test",
      stream: Array.from({ length: 4 }, (_, index) => ({
        cursor: `cursor-${index}`,
        type: "request.completed",
        data: { requestId: `request-${index}`, outcome: "success" },
      })),
    },
  });
  const requestStream = await measure(100, async () => {
    const response = await streamApp.request("http://localhost/_relkit/v1/stream?limit=4");
    if (response.status !== 200 || !(await response.text()).includes("data:"))
      throw new Error("Stream fixture failed");
  });

  const jobSchema = schema.z.object({ value: schema.z.number() });
  const job = await testing.createTestJob({
    jobId: "bench.job",
    target: {
      id: "bench.job",
      input: jobSchema,
      output: jobSchema,
      handler: (value: PerformanceRecord) => value,
    },
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
      delivery: "durable",
      target: events.defineEventFunction({
        id: `bench.event.handler.${index}`,
        event: "bench.event",
        handler: async () => undefined,
      }),
    })),
  });
  const eventStarted = performance.now();
  await repeat(100, (index) => event.publish({ value: index }));
  await event.drain();
  const eventMs = performance.now() - eventStarted;
  const completed = event.completed();
  if (completed !== 800) throw new Error(`Event fan-out completed ${completed} deliveries`);
  await event.close();

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
  const graphLayout = layoutModule.layoutGraph({
    generationId: "bench",
    graphHash: "sha256:performance",
    nodes,
    declaredEdges: edges,
    observedEdges: [],
  });
  const layoutMs = performance.now() - layoutStarted;
  if (graphLayout.nodes.length !== 1_000)
    throw new Error("Inspector fixture did not layout 1,000 nodes");
  const candidateActivation = await measure(100, async () => {
    const machine = supervisor.createSupervisorStateMachine();
    const token = machine.requestSourceChange();
    machine.compileSucceeded(token);
    machine.startSucceeded(token);
    machine.verificationSucceeded(token);
    machine.switchSucceeded(token);
    if (machine.state !== "active") throw new Error("Candidate fixture did not activate");
  });
  return {
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
}
