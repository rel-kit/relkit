import { SERVER_RUNTIME_SUPPORT_SOURCE } from "./build-server-runtime-support.js";
/** Pure provider/task adapters; the typed host owns serial worker polling and draining. */
export const SERVER_RUNTIME_SOURCE = `
const deferredIntegrityChecks = new Map();
async function verifyDeferredFunction(functionId) {
  const existing = deferredIntegrityChecks.get(functionId);
  if (existing !== undefined) return existing;
  const verification = (async () => {
    const candidateRoot = new URL("../", import.meta.url);
    const routes = plan.httpTriggers.filter((route) => route.targetFunctionId === functionId).map((route) => route.id);
    const imports = JSON.parse(await readFile(new URL("imports.json", candidateRoot), "utf8"));
    const integrityBytes = await readFile(new URL("deferred-integrity.json", candidateRoot));
    const expectedIntegrityHash = process.env.RELKIT_DEFERRED_INTEGRITY_HASH;
    const actualIntegrityHash = "sha256:" + createHash("sha256").update(integrityBytes).digest("hex");
    if (expectedIntegrityHash === undefined || actualIntegrityHash !== expectedIntegrityHash)
      throw new Error("Deferred runtime integrity index verification failed.");
    const integrity = JSON.parse(integrityBytes.toString("utf8"));
    const members = new Set(imports.filter((entry) => routes.includes(entry.routeId)).flatMap((entry) => entry.members));
    for (const member of members) {
      const expected = integrity[member];
      if (expected === undefined) throw new Error("Deferred runtime integrity metadata is unavailable.");
      const bytes = await readFile(new URL(member, candidateRoot));
      const hash = "sha256:" + createHash("sha256").update(bytes).digest("hex");
      if (bytes.byteLength !== expected.bytes || hash !== expected.hash)
        throw new Error("Deferred runtime integrity verification failed.");
    }
  })();
  deferredIntegrityChecks.set(functionId, verification);
  return verification;
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

async function createNativeJobsRuntimes(providerRegistry) {
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
    await registerNativeJobWorker(runtime, (plan.jobs ?? []).filter((candidate) => candidate.profile === job.profile), tasks, executor);
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

async function startNativeJobWorker(runtimes) {
  if (runtimes.size === 0 || (process.env.RELKIT_WORKER_ROLE ?? "worker") === "api") return undefined;
  await runtimeOwner.worker("native-job-worker", async () => {
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
  });
}
${SERVER_RUNTIME_SUPPORT_SOURCE}
`;
