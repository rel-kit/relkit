/**
 * Emits the function-host drain of the generated server. A function host (the Vercel function entry)
 * activates the server with `{ functionHost: true }`: no listener, no signal handlers, and in the
 * `api` worker role no background worker or scheduler loop, because the instance is frozen between
 * invocations. Instead the host calls `drain` from Vercel Cron and after requests: it reconciles the
 * persisted schedules once per instance, runs one scheduler pass (the backend claims each occurrence
 * once, unique on schedule and occurrence time), then runs due job attempts and event deliveries
 * until none is left or the time budget is spent.
 */

/** Generated source of `drainFunctionHost` and its readiness wait. */
export const SERVER_FUNCTION_HOST_SOURCE = `
const functionHostReconciled = new WeakSet();

async function awaitFunctionHostReady(deadline) {
  for (;;) {
    const state = runtimeState();
    if (state.ready.provider && state.ready.nativeWorker && state.ready.database && state.ready.auth) return;
    if (Date.now() >= deadline) throw new Error("The server did not become ready in time.");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function reconcileFunctionHostSchedules(registration) {
  const native = registration.runtime.adapter.schedules;
  if (native === undefined || functionHostReconciled.has(registration)) return;
  for (const definition of registration.definitions)
    await reconcileNativeSchedules({
      native,
      desired: definition.schedules ?? [],
      context: registration.runtime.operationContext({ signal: shutdownController.signal }),
      jobId: definition.jobId,
      taskId: definition.taskId,
      taskVersion: definition.taskVersion,
      buildId: definition.buildId,
    });
  functionHostReconciled.add(registration);
}

async function functionHostEventProviders() {
  const providerRegistry = await providerStartup;
  if (providerRegistry === undefined) return [];
  const profiles = new Set((plan.eventTriggers ?? []).map((trigger) => trigger.config?.profile ?? "default"));
  return [...profiles].map((profile) => provider(providerRegistry, "event", profile)).filter((value) => typeof value?.deliverDue === "function");
}

/** Runs schedules, job attempts and event deliveries that are due, within \`budgetMs\`. */
async function drainFunctionHost(options = {}) {
  const deadline = Date.now() + (options.budgetMs ?? 25_000);
  await awaitFunctionHostReady(deadline);
  const result = { occurrences: 0, runs: 0, deliveries: 0 };
  for (const registration of nativeJobWorkerRegistrations) {
    await reconcileFunctionHostSchedules(registration);
    const tick = registration.runtime.adapter.tickSchedules;
    if (typeof tick === "function") result.occurrences += (await tick()).length;
  }
  const events = await functionHostEventProviders();
  while (Date.now() < deadline) {
    const runs = await processNativeJobPass(nativeJobsRuntimes);
    let deliveries = 0;
    for (const consumer of events) deliveries += await consumer.deliverDue();
    result.runs += runs;
    result.deliveries += deliveries;
    if (runs === 0 && deliveries === 0) break;
  }
  return result;
}
`;
