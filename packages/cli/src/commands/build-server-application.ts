/**
 * Emits the application portion of an accepted server cohort.
 * This pure fragment acquires no resources; generated code delegates ownership
 * and expected runtime failures to the existing typed server host.
 */

import type { ServerSourceEmission } from "./build-server.types.js";

/**
 * Emits this stage from the same complete compilation result as every neighbor.
 * @param input - Accepted graph/cohort and feature-selected emission fragments.
 * @returns Pure source text; no descriptors are reevaluated.
 */
export function serverApplicationSource(input: ServerSourceEmission): string {
  const { agentSource } = input;
  return `const jobsRuntimeModule = (plan.jobs ?? []).length === 0
  ? undefined
  : await import("@relkit/jobs");
const createJobsControls = jobsRuntimeModule?.createJobsControls;
const createJobsRuntime = jobsRuntimeModule?.createJobsRuntime;
const reconcileNativeSchedules = jobsRuntimeModule?.reconcileNativeSchedules;
const runInJobsRuntime = jobsRuntimeModule?.runInJobsRuntime;
const realtimeRuntimeModule = (plan.channels ?? []).length === 0
  ? undefined
  : await import("@relkit/realtime");
const createProviderRealtimeDispatcher = realtimeRuntimeModule?.createProviderRealtimeDispatcher;
const setActiveRealtimeDispatcher = realtimeRuntimeModule?.setActiveRealtimeDispatcher;
const executableManifest = {
  ...runtimeManifest,
  functions: { ...runtimeManifest.functions },
  targets: { ...runtimeManifest.targets },
};
const application = runtimeManifest.application;
if (application === undefined) throw new Error("Runtime application metadata is unavailable.");
const environmentResolution = resolveRuntimeEnvironment(application.env, environment, sourceValues);
const values = environmentResolution.values;
const specializedInstrumentation = await Effect.runPromise(
  Effect.context().pipe(
    Effect.annotateLogs({ generationId, graphHash, source: "direct" }),
    Effect.provide(createLoggerLayer({
      component: "runtime.specialized",
      minimumLevel: process.env.RELKIT_DEV_LOGS === "1" ? "all" : "info",
      collector: telemetry,
      human: { write: (_line, record) => writeRuntimeLog(record) },
      json: false,
    })),
  ),
);
const databaseStartup = databaseNode === undefined ? undefined : runtimeOwner.resource("database", () => createDatabaseRegistration(databaseNode, runtimeManifest.services, values), (value) => value.close(), () => runtimeOwner.setReady("database", true));
const authStartup = authNode === undefined ? undefined : runtimeOwner.resource("auth", () => createBetterAuthRegistration(authNode, runtimeManifest.services, databaseStartup), () => {}, () => runtimeOwner.setReady("auth", true));
const authRequestStorage = new AsyncLocalStorage();
const authRuntime = createAuthRegistration(graph, runtimeManifest.routes, authStartup);
const contextResolver = createApplicationContextResolver({
  constants: runtimeManifest.constants,
  prompts: runtimeManifest.prompts,
  env: values,
});
${agentSource.startup}
const registry = createFunctionRegistry(graph, executableManifest);
let materializedJobs;
let nativeJobsRuntimes = new Map();
const nativeJobWorkerRegistrations = new Set();
const nativeJobWorkerReadyHandles = new Set();
const nativeJobWorkerEndpoints = new Map();
`;
}
