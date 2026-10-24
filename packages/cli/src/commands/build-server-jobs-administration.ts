/** Emits live development provider administration independently from rich inspection. */
import { NATIVE_JOBS_INSPECTOR_SOURCE } from "./build-server-inspector-runtime.js";
import type { ServerSourceConfiguration } from "./build-server.types.js";

/** Preserves the established native admin bearer policy and generation-owned disposal.
 * @param configuration - Checked mode and selected-jobs policy.
 * @returns Eager canonical-app registration before any listener is acquired.
 */
export function serverJobsAdministrationSource(configuration: ServerSourceConfiguration): string {
  if (!configuration.jobsAdministration) return "";
  return `if (environment !== "production" && (plan.jobs ?? []).length > 0) {
  const nativeJobsModule = await import("@relkit/inspector-api");
  await runtimeOwner.resource("http.jobs-administration", async () => {
    try {
      nativeJobsModule.installJobsAdministrationEndpoints(app, {
        mode: environment,
        ...(process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN === undefined ? {} : { bearerToken: process.env.RELKIT_INTERNAL_ENDPOINT_TOKEN }),
        activeGeneration: { generationId, graphHash, activationFingerprint, graph,
${NATIVE_JOBS_INSPECTOR_SOURCE}        },
      });
      return app;
    } catch (cause) {
      await nativeJobsModule.disposeInspectorEndpoints(app);
      throw cause;
    }
  }, (value) => nativeJobsModule.disposeInspectorEndpoints(value));
}
`;
}
