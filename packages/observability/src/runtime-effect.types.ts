import type { runtimeCore } from "./runtime-core.js";
/** Live local or remote runtime owned by an Effect Scope. */
export type ObservabilityRuntimeEffects = Awaited<
  ReturnType<typeof runtimeCore.createObservabilityRuntime>
>;
