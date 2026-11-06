import type { remoteRuntimeCore } from "./remote-runtime-core.js";
/** Remote runtime owned by an Effect Scope. */
export type RemoteObservabilityRuntimeEffects = Awaited<
  ReturnType<typeof remoteRuntimeCore.createRemoteObservabilityRuntime>
>;
