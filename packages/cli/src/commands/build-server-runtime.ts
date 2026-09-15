import { GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@relkit/contracts";
export const SERVER_RUNTIME_SOURCE = `
function targetFor(functionId) {
  const target = executableManifest.targets?.[functionId];
  return target !== null && typeof target === "object" && typeof target.handler === "function"
    ? target
    : undefined;
}
function createDependencySources(providerRegistry) {
  return {
    agents: Object.fromEntries(plan.agents.map((node) => [node.id, registry.get(\`relkit.agent.\${node.id}.invoke\`)])),
    buckets: Object.fromEntries(plan.buckets.map((node) => [node.id, provider(providerRegistry, "bucket", node.profile)])),
    cache: Object.fromEntries(plan.caches.map((node) => [node.id, provider(providerRegistry, "cache", node.profile)])),
    jobs: Object.fromEntries([
      ...plan.queues.filter((node) => node.kind === "job").map((node) => [node.id, materializedJobs?.jobs.get(node.id)]),
      ...(plan.jobs ?? []).map((node) => [node.id, runtimeManifest.jobs?.[node.id]]),
    ]),
    tasks: Object.fromEntries(Object.entries(runtimeManifest.tasks ?? {})),
    events: Object.fromEntries((plan.events ?? []).map((node) => [node.id, provider(providerRegistry, "event", node.profile)])),
  };
}

function taskDescriptors() {
  return Object.fromEntries(Object.entries(runtimeManifest.tasks ?? {}).filter((entry) => {
    const value = entry[1];
    return value !== null && typeof value === "object" && typeof value.handler === "function";
  }));
}

function createNativeJobsRuntimes(providerRegistry) {
  const tasks = taskDescriptors();
  const executor = createTaskExecutor({
    tasks,
    registry,
    clients: createDependencySources(providerRegistry),
    env: values,
    context: (context) => invocationContext(context, undefined),
  });
  const runtimes = new Map();
  for (const job of plan.jobs ?? []) {
    if (runtimes.has(job.profile)) continue;
    const adapter = provider(providerRegistry, "job", job.profile);
    const runtime = createJobsRuntime({
      adapter,
      application: graph.appId,
      environment,
      scope: "default",
      service: job.profile,
      serviceGeneration: job.serviceGeneration ?? generationId,
      ...(nativeJobsManifest === undefined ? {} : { manifest: nativeJobsManifest }),
      tasks: Object.values(tasks),
      taskExecutor: executor,
    });
    registerNativeJobWorker(runtime, (plan.jobs ?? []).filter((candidate) => candidate.profile === job.profile), tasks, executor);
    runtimes.set(job.profile, runtime);
  }
  return runtimes;
}

async function nativeJobStatus(runId) {
  for (const runtime of nativeJobsRuntimes.values()) {
    try { return await createJobsControls(runtime).get(runId); } catch {}
  }
  return undefined;
}

async function nativeJobControl(instanceId, action, reason) {
  for (const runtime of nativeJobsRuntimes.values()) {
    try {
      const controls = createJobsControls(runtime);
      return action === "retry"
        ? await controls.retry(instanceId, { operationId: crypto.randomUUID() })
        : await controls.cancel(instanceId, { operationId: crypto.randomUUID(), ...(reason === undefined ? {} : { reason }) });
    } catch {}
  }
  throw new Error("Native job run was not found");
}

function startNativeJobWorker(runtimes) {
  if (runtimes.size === 0) return undefined;
  let running = false;
  const worker = setInterval(() => {
    if (running || stopping) return;
    running = true;
    const task = (async () => {
      try {
        for (const runtime of runtimes.values()) {
          const nativeWorker = runtime.adapter.worker;
          if (nativeWorker === undefined || runtime.taskExecutor === undefined) continue;
          const operation = runtime.operationContext({ signal: shutdownController.signal });
          const work = await nativeWorker.next(operation);
          if (work === undefined) continue;
          try {
            const output = await runInJobsRuntime(runtime, () => runtime.taskExecutor.execute(work.envelope, work.binding));
            await nativeWorker.complete(work.envelope.runId, output, operation);
          } catch (error) {
            if (work.binding.isSuspension?.(error) === true) {
              if (nativeWorker.suspend === undefined) throw new Error("Native worker cannot persist task continuation");
              await nativeWorker.suspend(work.envelope.runId, error, operation);
            } else {
              await nativeWorker.fail(work.envelope.runId, error, operation);
            }
          }
        }
      } catch (error) {
        recordRuntimeFailure("runtime.native-job-worker", "Native jobs worker failed", error, "job");
      } finally {
        running = false;
      }
    })();
    activeInvocations.add(task);
    void task.then(
      () => activeInvocations.delete(task),
      () => activeInvocations.delete(task),
    );
  }, environment === "production" ? 1_000 : 100);
  worker.unref?.();
  return worker;
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
  const value = provider(providerRegistry, "job", context.profile);
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
  const record = telemetry.collect({
    version: 2,
    signal: "log",
    timestamp: new Date().toISOString(),
    level: "error",
    component,
    message,
    fields: { code: errorCode(error), detail: errorMessage(error), ...(environment !== "production" && process.env.RELKIT_DEV_LOGS === "1" ? { error: redactFailureDetail(error, undefined, 0, true) } : {}) },
    generationId,
    graphHash,
    source,
  });
  writeRuntimeLog(record);
}
function writeRuntimeLog(record) {
  if (record?.signal !== "log") return;
  if (environment === "production") stdoutJsonSink.write(record);
  else if (process.env.RELKIT_DEV_LOGS === "1") process.stdout.write("\\u001e" + JSON.stringify(record) + "\\n");
  else consoleHumanSink.write(formatHumanLog(record), record);
}
function healthResponse(status, code = 200) {
  return Response.json({ protocol: "relkit.inspector", version: 1, status, graphHash, activationFingerprint, manifestGraphHash: runtimeManifest.graphHash, graphContractVersion: ${GRAPH_VERSION}, manifestContractVersion: ${MANIFEST_VERSION}, manifestGeneratorVersion: ${GENERATOR_VERSION}, environmentReady: true, providerReady: providerReady && nativeJobWorkerReady && !stopping, databaseReady: databaseReady && !stopping, authReady: authReady && !stopping, ...(sourceToken === undefined ? {} : { sourceToken }), ...(generationToken === undefined ? {} : { generationToken }) }, { status: code, headers: { "x-relkit-api-version": "1" } });
}
function tokenFrom(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}
function readLocalServiceInspectorState(value) {
  if (value === undefined) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {}
  return { lease: { status: "blocked" } };
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
