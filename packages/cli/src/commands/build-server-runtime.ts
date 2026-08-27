import { GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@relkit/contracts";
export const SERVER_RUNTIME_SOURCE = `
function bindAgents() {
  for (const node of plan.agents) {
    const agent = runtimeManifest.agents?.[node.id];
    if (agent === undefined) throw new Error(\`Agent descriptor "\${node.id}" is unavailable.\`);
    const functionId = \`relkit.agent.\${node.id}.invoke\`;
    executableManifest.functions[functionId] = createGeneratedAgentFunction(
      node.id,
      (input, context) => invokeBoundAgent(node, agent, input, context),
    );
  }
}
function routeMiddlewareContext({ middlewareId, signal }) {
  const time = Object.freeze({
    now: () => new Date(),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  });
  const write = (level, message, fields = {}) => {
    const record = telemetry.collect({
      version: 1,
      signal: "log",
      timestamp: time.now().toISOString(),
      level,
      component: middlewareId,
      message,
      fields,
    });
    if (record?.signal === "log") consoleHumanSink.write(formatHumanLog(record), record);
  };
  const logger = (level) => (message, fields) => write(level, message, fields);
  return {
    signal,
    env: values,
    time,
    log: Object.freeze({
      trace: logger("trace"),
      debug: logger("debug"),
      info: logger("info"),
      warn: logger("warn"),
      error: logger("error"),
    }),
  };
}
async function invokeBoundAgent(node, agent, input, context) {
  const providerRegistry = await providerStartup;
  if (providerRegistry === undefined) throw new Error("Provider registry unavailable.");
  const modelRegistry = provider(providerRegistry, "models", node.profile);
  if (modelRegistry === undefined)
    throw new Error("Model provider registry unavailable.");
  return invokeAgent({
    agent,
    input,
    modelRegistry,
    tools: runtimeManifest.tools ?? {},
    engine: { invoke: invokeHttp },
    invocationId: context.invocation.id,
    traceId: context.invocation.traceId,
    signal: context.signal,
    timeoutMs: agent.limits.timeoutMs,
    hooks: { observability: telemetry },
  });
}
function targetFor(functionId) {
  const target = executableManifest.targets?.[functionId];
  return target !== null && typeof target === "object" && typeof target.handler === "function"
    ? target
    : undefined;
}
function createDependencySources(providerRegistry) {
  return {
    agents: Object.fromEntries(plan.agents.map((node) => [node.id, registry.get(\`relkit.agent.\${node.id}.invoke\`)])),
    buckets: Object.fromEntries(plan.buckets.map((node) => [node.id, provider(providerRegistry, "buckets", node.profile)])),
    cache: Object.fromEntries(plan.caches.map((node) => [node.id, provider(providerRegistry, "cache", node.profile)])),
    jobs: Object.fromEntries(plan.queues.filter((node) => node.kind === "job").map((node) => [node.id, materializedJobs?.jobs.get(node.id)])),
    events: Object.fromEntries((plan.events ?? []).map((node) => [node.id, provider(providerRegistry, "events", node.profile)])),
  };
}
function provider(providerRegistry, capability, profile) {
  return providerRegistry.resolve(capability, profile).value;
}
async function supportsInspector(capability, nodes, id, ...operations) {
  try {
    const inspector = await resourceInspector(capability, nodes, id);
    return operations.every((operation) => typeof inspector[operation] === "function");
  } catch {
    return false;
  }
}
async function resourceInspector(capability, nodes, id) {
  const node = nodes.find((candidate) => candidate.id === id);
  if (node === undefined) throw new Error(\`Resource "\${id}" is unavailable.\`);
  const providerRegistry = await providerStartup;
  if (providerRegistry === undefined) throw new Error("Provider registry unavailable.");
  const value = provider(providerRegistry, capability, node.profile);
  if (value === null || typeof value !== "object" || value.inspector === undefined)
    throw new Error(\`Resource "\${id}" does not support inspector access.\`);
  return value.inspector;
}
async function resolveRateLimitStore(storeId) {
  const cache = plan.caches.find((node) => node.id === storeId);
  if (cache === undefined) throw new Error(\`Rate-limit cache "\${storeId}" is unavailable.\`);
  const providerRegistry = await providerStartup;
  if (providerRegistry === undefined) throw new Error("Provider registry unavailable.");
  return provider(providerRegistry, "cache", cache.profile);
}
function queueProvider(providerRegistry, context) {
  const value = provider(providerRegistry, "jobs", context.profile);
  if (value === null || typeof value !== "object" || typeof value.createQueue !== "function")
    throw new Error(\`Job provider profile "\${context.profile}" cannot materialize queues.\`);
  return value.createQueue(context);
}
function startJobWorker(jobs) {
  let running = false;
  const worker = setInterval(async () => {
    if (running || stopping) return;
    running = true;
    try {
      await jobs.tick(new Date());
      await Promise.all([...jobs.jobs.keys()].map((jobId) => jobs.runNext(jobId)));
    } catch (error) {
      recordRuntimeFailure("runtime.job-worker", "Job worker failed", error, "job");
    } finally {
      running = false;
    }
  }, environment === "production" ? 1_000 : 100);
  worker.unref?.();
  return worker;
}
function errorCode(error) {
  if (error !== null && typeof error === "object" && typeof error.code === "string") return error.code;
  if (error !== null && typeof error === "object" && error.name === "EnvResolutionError") return "RELKIT_ENVIRONMENT_INVALID";
  return error instanceof Error ? error.name : "unknown";
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
function recordRuntimeFailure(component, message, error, source) {
  captureRuntimeError(error);
  const record = telemetry.collect({
    version: 1,
    signal: "log",
    timestamp: new Date().toISOString(),
    level: "error",
    component,
    message,
    fields: { code: errorCode(error), detail: errorMessage(error) },
    generationId,
    graphHash,
    source,
  });
  if (record?.signal === "log") consoleHumanSink.write(formatHumanLog(record), record);
}
function healthResponse(status, code = 200) {
  return Response.json({ protocol: "relkit.inspector", version: 1, status, graphHash, manifestGraphHash: runtimeManifest.graphHash, graphContractVersion: ${GRAPH_VERSION}, manifestContractVersion: ${MANIFEST_VERSION}, manifestGeneratorVersion: ${GENERATOR_VERSION}, environmentReady: true, providerReady: providerReady && !stopping, ...(sourceToken === undefined ? {} : { sourceToken }), ...(generationToken === undefined ? {} : { generationToken }) }, { status: code, headers: { "x-relkit-api-version": "1" } });
}
function tokenFrom(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
function resolveEnvironment(value, nodeEnvironment) {
  if (value === "development" || value === "test" || value === "production") return value;
  return nodeEnvironment === "production" ? "production" : "development";
}
function resolveRuntimeEnvironment(definition, environment, source) {
  try {
    const resolved = resolveEnv(definition, { environment, source });
    const values = { ...source };
    for (const [name, value] of Object.entries(resolved)) {
      if (source[name] !== undefined || value === undefined) continue;
      values[name] = runtimeEnvironmentValue(value);
    }
    return { values, error: undefined };
  } catch (error) {
    return { values: source, error };
  }
}
function runtimeEnvironmentValue(value) {
  return value;
}
function waitForProviderReady() {
  const milliseconds = timeoutFrom(process.env.RELKIT_PROVIDER_READY_DELAY_MS, 0);
  if (milliseconds === 0) return Promise.resolve();
  return new Promise((resolve, reject) => { const timer = setTimeout(resolve, milliseconds); shutdownController.signal.addEventListener("abort", () => { clearTimeout(timer); reject(shutdownController.signal.reason ?? new Error("Provider startup was aborted.")); }, { once: true }); });
}
`;
