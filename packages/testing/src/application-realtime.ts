import type { ProviderRegistry } from "@relkit/engine";
import { createProviderRealtimeDispatcher, runWithRealtimeDispatcher } from "@relkit/realtime";
import type { RealtimeProvider } from "@relkit/realtime";
import type { TestApplicationArtifacts } from "./application-registry.js";
import type { TestRuntime } from "./runtime.js";

/**
 * Binds registered realtime contracts to the acquired test provider generation.
 * @param runtime - Acquired deterministic invocation runtime.
 * @param artifacts - Generated graph and integration modules, when available.
 * @param providers - Acquired native provider registry or explicit replacement declarations.
 * @param environment - Explicit application environment identity.
 * @returns The runtime facade carrying native realtime invocation hooks.
 */
export function bindTestRealtime(
  runtime: TestRuntime,
  artifacts: TestApplicationArtifacts | undefined,
  providers: ProviderRegistry | undefined,
  environment: string,
): TestRuntime {
  if (
    artifacts === undefined ||
    providers === undefined ||
    !providers.requirements.some(({ capability }) => capability === "realtime")
  )
    return runtime;
  const dispatcher = createProviderRealtimeDispatcher({
    applicationId: artifacts.graph.appId ?? "test-application",
    environment,
    generationId: providers.generationId,
    publicFingerprint: artifacts.publicFingerprint,
    provider: (profile) => providers.resolve("realtime", profile).value as RealtimeProvider,
  });
  const invoke: TestRuntime["invoke"] = (target, input, options) =>
    runWithRealtimeDispatcher(dispatcher, () => runtime.invoke(target, input, options));
  return Object.freeze({ ...runtime, invoke });
}
