/**
 * Emits the tail portion of an accepted server cohort.
 * This pure fragment acquires no resources; generated code delegates ownership
 * and expected runtime failures to the existing typed server host.
 */
import { serverHttpSource } from "./build-server-http.js";
import { SERVER_INVOCATION_SOURCE } from "./build-server-invocation.js";
import { SERVER_REGISTRATION_SOURCE } from "./build-server-registration.js";
import { SERVER_NATIVE_WORKER_SOURCE } from "./build-server-native-worker.js";
import { SERVER_RUNTIME_SOURCE } from "./build-server-runtime.js";
import { serverShutdownSource } from "./build-server-shutdown.js";
import type { ServerSourceEmission } from "./build-server.types.js";

/**
 * Emits this stage from the same complete compilation result as every neighbor.
 * @param input - Accepted graph/cohort and feature-selected emission fragments.
 * @returns Pure source text; no descriptors are reevaluated.
 */
export function serverTailSource(input: ServerSourceEmission): string {
  const { configuration, agentSource } = input;
  return `${serverHttpSource(configuration)}
${SERVER_INVOCATION_SOURCE}
${SERVER_REGISTRATION_SOURCE}
${agentSource.registration}
${SERVER_NATIVE_WORKER_SOURCE}
${SERVER_RUNTIME_SOURCE}
${serverShutdownSource(agentSource.release)}
} catch (error) {
  await runtimeOwner.shutdown(async () => {});
  throw error;
}
`;
}
