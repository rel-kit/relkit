/**
 * Emits the provider portion of an accepted server cohort.
 * This pure fragment acquires no resources; generated code delegates ownership
 * and expected runtime failures to the existing typed server host.
 */

export const SERVER_PROVIDER_SOURCE = `const providerStartup = runtimeOwner.resource("provider", (signal) => environmentResolution.error === undefined
  ? createProviderRegistry({ generationId, graph, runtimeIntegrationModules, bindingValues: sourceValues, localBindingValues, infrastructureBindingValues, signal })
  : Promise.reject(environmentResolution.error), (value) => value.dispose(), async (value) => {
  if ((plan.channels ?? []).length > 0) setActiveRealtimeDispatcher(createProviderRealtimeDispatcher({ applicationId: graph.appId, environment, generationId, publicFingerprint, provider: (profile) => provider(value, "realtime", profile) }));
  await materializeEvents({ plan, providerRegistry: value, engine: { invoke: invokeHttp } });
  materializedJobs = await materializeJobs({ plan, engine: { invoke: invokeHttp }, createQueue: (context) => queueProvider(value, context), spanRuntime });
  if (plan.queues.length > 0) await startJobWorker(materializedJobs);
  nativeJobsRuntimes = await createNativeJobsRuntimes(value);
  await startNativeJobWorker(nativeJobsRuntimes);
  await runtimeOwner.providerDelay();
  runtimeOwner.setReady("provider", true);
}, "application", false).catch((error) => {
  return undefined;
});
void databaseStartup?.catch(() => {});
void authStartup?.catch(() => {});
`;
