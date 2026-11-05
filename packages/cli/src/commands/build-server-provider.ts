/**
 * Emits the provider portion of an accepted server cohort.
 * This pure fragment acquires no resources; generated code delegates ownership
 * and expected runtime failures to the existing typed server host.
 */

/**
 * Emits provider acquisition with the container's durable-state guard.
 * @param localDurableProfiles - Used local jobs/events profiles, such as `job:default`.
 * @returns Source that rejects provider startup inside the image (`RELKIT_DURABLE_STATE=external`)
 *   while any of those profiles is selected, unless `RELKIT_ALLOW_LOCAL_DURABLE_STATE=1` opts in.
 */
export function serverProviderSource(localDurableProfiles: readonly string[]): string {
  return `const localDurableProfiles = ${JSON.stringify(localDurableProfiles)};
const localDurableStateError = localDurableProfiles.length > 0 && process.env.RELKIT_DURABLE_STATE === "external" && process.env.RELKIT_ALLOW_LOCAL_DURABLE_STATE !== "1"
  ? Object.assign(new Error("RELKIT_LOCAL_DURABLE_STATE_IN_CONTAINER: " + localDurableProfiles.join(", ") + " use the local filesystem provider, which keeps jobs, schedules and events on this container's disk. Use @relkit/postgres (relkit add jobs --provider postgres; relkit add events --provider postgres), or mount a volume at .relkit/state and set RELKIT_ALLOW_LOCAL_DURABLE_STATE=1 for a single instance."), { code: "RELKIT_LOCAL_DURABLE_STATE_IN_CONTAINER" })
  : undefined;
const providerStartup = runtimeOwner.resource("provider", (signal) => environmentResolution.error === undefined && localDurableStateError === undefined
  ? createProviderRegistry({ generationId, graph, runtimeIntegrationModules, bindingValues: sourceValues, localBindingValues, infrastructureBindingValues, signal })
  : Promise.reject(environmentResolution.error ?? localDurableStateError), (value) => value.dispose(), async (value) => {
  if ((plan.channels ?? []).length > 0) setActiveRealtimeDispatcher(createProviderRealtimeDispatcher({ applicationId: graph.appId, environment, generationId, publicFingerprint, provider: (profile) => provider(value, "realtime", profile) }));
  // An embedded handle starts no event consumers or job workers.
  if (relkitMode.embedded !== true) await materializeEvents({ plan, providerRegistry: value, engine: { invoke: invokeHttp } });
  nativeJobsRuntimes = await createNativeJobsRuntimes(value);
  if (relkitMode.embedded !== true) await startNativeJobWorker(nativeJobsRuntimes);
  await runtimeOwner.providerDelay();
  runtimeOwner.setReady("provider", true);
}, "application", false).catch((error) => {
  return undefined;
});
void databaseStartup?.catch(() => {});
for (const [, startup] of otherDatabaseStartups) void startup.catch(() => {});
void authStartup?.catch(() => {});
`;
}
