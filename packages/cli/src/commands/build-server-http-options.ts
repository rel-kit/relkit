/**
 * Emits application options from the accepted HTTP configuration. Core REST
 * policy, optional transport dependencies and internal cohort proof stay in
 * canonical order; these pure fragments acquire no resources themselves.
 */
import { GENERATOR_VERSION, GRAPH_VERSION, MANIFEST_VERSION } from "@relkit/contracts";
import type { ServerSourceConfiguration } from "./build-server.types.js";

/** Emits the complete application configuration without evaluating declarations.
 * @param configuration - Checked server and inspector settings.
 * @returns Native source consumed before application resource acquisition.
 */
export function serverHttpOptionsSource(configuration: ServerSourceConfiguration): string {
  return (
    coreHttpOptionsSource(configuration) +
    HTTP_OPTIONAL_TRANSPORT_SOURCE +
    internalHttpOptionsSource(configuration)
  );
}

/** Emits REST, document and client identity dependencies.
 * @param configuration - Checked document exposure policy.
 * @returns Opening application options source, awaiting optional registrations.
 */
function coreHttpOptionsSource(configuration: ServerSourceConfiguration): string {
  return `const httpApplicationOptions = {
  upgradeWebSocket,
  plan,
  manifest: executableManifest,
  engine: { invoke: invokeHttp },
  resolveTarget: async (functionId) => {
    const loader = runtimeManifest.targetLoaders?.[functionId];
    if (loader === undefined) return targetFor(functionId);
    await verifyDeferredFunction(functionId);
    return loader();
  },
  observability: telemetry,
  responseMapping: { mode: environment },
  middlewareContext: routeMiddlewareContext,
  middleware: httpMiddlewareOptions,
  apiDocs: {
    mode: environment,
    document: openapiDocument,
    enabledInProduction: ${String(configuration.apiDocs.enabledInProduction)},
    excludeDomains: ${JSON.stringify(configuration.apiDocs.excludeDomains ?? [])},
    ...(process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN === undefined
      ? {}
      : { bearerToken: process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN }),
  },
  clientContract: {
    enabled: ${String(configuration.clientContract)},
    document: clientContractDocument,
  },
  clientIdentity: {
    applicationId: graph.appId,
    publicFingerprint,
    ...((plan.jobs ?? []).length === 0 ? {} : { jobs: { protocol: "relkit.jobs", version: 1 } }),
    resolve: ({ request, session }) => resolveClientIdentityRegistration(request, session),
  },
  transportSecurity: transportSecurityRegistration(),
`;
}

/** Optional transport providers are resolved per invocation by the owned host. */
const HTTP_OPTIONAL_TRANSPORT_SOURCE = `  ...((plan.channels ?? []).length === 0 ? {} : {
    realtime: {
      applicationId: graph.appId,
      environment,
      provider: async (profile) => {
        const registry = await providerStartup;
        if (registry === undefined) throw new Error("Realtime provider registry unavailable.");
        return provider(registry, "realtime", profile);
      },
      trustedContext: ({ request, auth }) => ({ request, auth }),
    },
  }),
  ...(plan.agents.every((node) => node.client === undefined) ? {} : {
    agentRuntime: {
      applicationId: graph.appId,
      environment,
      generationId,
      publicFingerprint,
      signal: shutdownController.signal,
      track: (task) => {
        void runtimeOwner.track(task).catch(() => {});
      },
      provider: async (profile) => {
        const registry = await providerStartup;
        if (registry === undefined) throw new Error("Agent-state provider registry unavailable.");
        return provider(registry, "agent-state", profile);
      },
      trustedContext: ({ request, auth }) => ({ request, auth }),
    },
  }),
  ...((plan.jobs ?? []).length === 0 ? {} : {
    jobs: {
      runtimes: () => nativeJobsRuntimes,
      descriptors: runtimeManifest.jobs,
      tasks: runtimeManifest.tasks,
      application: graph.appId,
      environment,
      publicFingerprint,
      protocolVersion: 1,
      ...(process.env.RELKIT_JOBS_CURSOR_SECRET === undefined
        ? {}
        : { cursorSecret: process.env.RELKIT_JOBS_CURSOR_SECRET }),
    },
  }),
`;

/** Emits native route policy and the protected active cohort witness.
 * @param configuration - Checked MCP exposure and versioned server settings.
 * @returns Closing application options source, retaining live readiness checks.
 */
function internalHttpOptionsSource(configuration: ServerSourceConfiguration): string {
  return `  mcp: { enabled: ${String(configuration.mcp)} },
  staticFiles: { root: process.env.RELKIT_PUBLIC_ROOT ?? new URL("../public", import.meta.url).pathname },
  rateLimitRuntime: { resolveStore: resolveRateLimitStore },
  ...(authRuntime === undefined ? {} : { auth: authRuntime }),
  internalEndpoints: {
    mode: environment,
    enabled: internalEndpointsEnabled,
    graph: {
      generationId,
      graphHash,
      activationFingerprint,
      manifestGraphHash: runtimeManifest.graphHash,
      graphContractVersion: ${GRAPH_VERSION},
      manifestContractVersion: ${MANIFEST_VERSION},
      manifestGeneratorVersion: ${GENERATOR_VERSION},
      graph,
    },
    ...(process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN === undefined
      ? {}
      : { bearerToken: process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN }),
    readiness: () => ({
      ready: runtimeState().ready.provider && runtimeState().ready.nativeWorker && runtimeState().ready.database && runtimeState().ready.auth && !runtimeState().stopping,
      ...(runtimeState().stopping ? { reason: "stopping" } : runtimeState().primaryFailures.length > 0 ? { reason: "unavailable" } : {}),
    }),
  },
};
`;
}
