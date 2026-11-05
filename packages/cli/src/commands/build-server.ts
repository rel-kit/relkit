/**
 * Composes pure server source fragments from one checked graph and activation
 * cohort. Optional agent wiring follows graph declarations; the emitted host
 * retains environment/provider checks and owns runtime acquisition and shutdown.
 */
import type { JsonValue, RuntimeActivationFingerprint } from "relkit/contracts";
import type { ApplicationGraph } from "relkit/graph";
import { serverSourceOptions } from "./build-server-options.js";
import { serverAgentSource } from "./build-server-agents.js";
import type { ServerSourceConfiguration, ServerSourceEmission } from "./build-server.types.js";
import { serverImportsSource } from "./build-server-imports.js";
import { serverIdentitySource } from "./build-server-identity.js";
import { SERVER_TELEMETRY_SOURCE } from "./build-server-telemetry.js";
import { serverApplicationSource } from "./build-server-application.js";
import { SERVER_PROVIDER_SOURCE } from "./build-server-provider.js";
import { serverTailSource } from "./build-server-tail.js";

/** Opens the activation function; `createRelkit` calls it with `{ embedded: true }`. */
const EMBEDDED_ACTIVATION_START = `/**
 * Activates the application. Run directly, it serves HTTP and runs workers until a signal stops it;
 * embedded by \`createRelkit\`, it activates providers only and returns the runtime handle.
 */
export async function activateRelkitApplication(relkitMode = { embedded: false }) {
`;

/** Closes the activation function and starts the server when this module is the entry point. */
const EMBEDDED_ACTIVATION_END = `}
if (relkitEntryPoint) await activateRelkitApplication();
`;
/**
 * Emits the server entrypoint shared by dev, start, and the production container.
 * @param graph - Validated application graph.
 * @param graphHash - Graph identity verified by the generated host.
 * @param activation - Atomic artifact activation identity.
 * @param openapi - Generated HTTP documentation.
 * @param clientContract - Generated client protocol contract.
 * @param configuration - Validated HTTP build configuration.
 * @returns Pure source text; resource lifetimes are delegated to the typed runtime helper.
 */
export function serverSource(
  graph: ApplicationGraph,
  graphHash: string,
  activation: RuntimeActivationFingerprint,
  openapi: JsonValue = {},
  clientContract: JsonValue = {},
  configuration: ServerSourceConfiguration = {
    maxBodyBytes: 1_048_576,
    apiDocs: { enabledInProduction: false, ui: false },
    clientContract: true,
    mcp: false,
    agUi: false,
    maxPreviewBytes: 1_048_576,
  },
): string {
  const input: ServerSourceEmission = {
    graph,
    graphHash,
    activation,
    openapi,
    clientContract,
    configuration,
    options: serverSourceOptions(graph, activation),
    agentSource: serverAgentSource(graph),
  };
  return [
    serverImportsSource(input),
    EMBEDDED_ACTIVATION_START,
    serverIdentitySource(input),
    SERVER_TELEMETRY_SOURCE,
    serverApplicationSource(input),
    SERVER_PROVIDER_SOURCE,
    serverTailSource(input),
    EMBEDDED_ACTIVATION_END,
  ].join("");
}
