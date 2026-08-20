import { GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@zsys/contracts";

export const SERVER_RUNTIME_SOURCE = `
function bindAgents() {
  for (const node of plan.agents) {
    const agent = runtimeManifest.agents?.[node.id];
    if (agent === undefined) throw new Error(\`Agent descriptor "\${node.id}" is unavailable.\`);
    const functionId = \`zsys.agent.\${node.id}.invoke\`;
    executableManifest.functions[functionId] = createGeneratedAgentFunction(
      node.id,
      (input, _request, context) => invokeBoundAgent(agent, input, context),
    );
  }
}

async function invokeBoundAgent(agent, input, context) {
  const providerRegistry = await providerStartup;
  if (providerRegistry === undefined) throw new Error("Provider registry unavailable.");
  return invokeAgent({
    agent,
    input,
    provider: provider(providerRegistry, "models", agent.modelProfile),
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
    functions: Object.fromEntries(plan.functions.map((node) => [node.id, registry.get(node.id)])),
    agents: Object.fromEntries(plan.agents.map((node) => [node.id, registry.get(\`zsys.agent.\${node.id}.invoke\`)])),
    buckets: Object.fromEntries(plan.buckets.map((node) => [node.id, provider(providerRegistry, "buckets", node.profile)])),
    cache: Object.fromEntries(plan.caches.map((node) => [node.id, provider(providerRegistry, "cache", node.profile)])),
    jobs: Object.fromEntries(plan.queues.filter((node) => node.kind === "job").map((node) => [node.id, materializedJobs?.jobs.get(node.id)])),
    events: Object.fromEntries((plan.events ?? []).map((node) => [node.id, provider(providerRegistry, "events", "default")])),
  };
}

function provider(providerRegistry, capability, profile) {
  return providerRegistry.resolve(capability, profile).value;
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
  if (error !== null && typeof error === "object" && error.name === "EnvResolutionError") return "ZSYS_ENVIRONMENT_INVALID";
  return error instanceof Error ? error.name : "unknown";
}

function recordRuntimeFailure(component, message, error, source) {
  const record = telemetry.collect({
    version: 1,
    signal: "log",
    timestamp: new Date().toISOString(),
    level: "error",
    component,
    message,
    fields: { code: errorCode(error) },
    generationId,
    graphHash,
    source,
  });
  if (record?.signal === "log") consoleHumanSink.write(formatHumanLog(record), record);
}

function healthResponse(status, code = 200) {
  return Response.json({ protocol: "zsys.inspector", version: 1, status, graphHash, manifestGraphHash: runtimeManifest.graphHash, graphContractVersion: ${GRAPH_VERSION}, manifestContractVersion: ${MANIFEST_VERSION}, manifestGeneratorVersion: ${GENERATOR_VERSION}, environmentReady: true, providerReady: providerReady && !stopping, ...(sourceToken === undefined ? {} : { sourceToken }), ...(generationToken === undefined ? {} : { generationToken }) }, { status: code, headers: { "x-zsys-api-version": "1" } });
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
  if (value instanceof URL) return value.toString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function waitForProviderReady() {
  const milliseconds = timeoutFrom(process.env.ZSYS_PROVIDER_READY_DELAY_MS, 0);
  if (milliseconds === 0) return Promise.resolve();
  return new Promise((resolve, reject) => { const timer = setTimeout(resolve, milliseconds); shutdownController.signal.addEventListener("abort", () => { clearTimeout(timer); reject(shutdownController.signal.reason ?? new Error("Provider startup was aborted.")); }, { once: true }); });
}
`;
