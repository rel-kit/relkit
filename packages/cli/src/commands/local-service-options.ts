import { join } from "node:path";
import { type LocalServicePlanEntry, type LocalServiceWorkerArtifact } from "@relkit/local-service";

/**
 * Associates local worker bindings with the accepted job generation for their profile.
 * @param services - Accepted local binding plans.
 * @param generation - One generation or profile-indexed compiler generations.
 * @returns An immutable binding-to-generation projection.
 */
export function localServiceGenerations(
  services: readonly LocalServicePlanEntry[],
  generation: string | Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      services
        .filter((entry) => entry.capability === "job")
        .flatMap((entry) => {
          const value = typeof generation === "string" ? generation : generation[entry.profile];
          return value === undefined ? [] : [[entry.bindingId, value]];
        }),
    ),
  );
}

/** Collects validated service generation identities for local job profiles.
 * @param graph - Validated job node projection.
 * @returns Accepted service generation identities indexed by job profile.
 */
export function localJobServiceGenerations(graph: {
  readonly nodes: readonly {
    readonly kind: string;
    readonly profile?: string;
    readonly serviceGeneration?: string;
  }[];
}): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      graph.nodes.flatMap((node) =>
        node.kind === "job" &&
        typeof node.profile === "string" &&
        typeof node.serviceGeneration === "string"
          ? [[node.profile, node.serviceGeneration]]
          : [],
      ),
    ),
  );
}

/**
 * Projects host and in-network worker endpoints for selected Inngest bindings.
 * @param services - Accepted local binding plans.
 * @param backendPort - Stable backend listener port.
 * @param workerEnabled - Whether the generated worker container is available.
 * @returns Immutable endpoints and unit-specific environment additions.
 */
export function localServiceRuntimeOptions(
  services: readonly LocalServicePlanEntry[],
  backendPort: number,
  workerEnabled = false,
): {
  readonly endpoints: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly environmentOverrides: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly environmentOverridesByUnit: Readonly<
    Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>
  >;
} {
  if (!Number.isSafeInteger(backendPort) || backendPort < 1 || backendPort > 65535) {
    throw new Error("The local backend port is invalid.");
  }
  const inngest = services.filter((entry) => entry.recipe.integrationId === "inngest");
  const profiles = new Set(inngest.map((entry) => entry.profile));
  const origin = `http://host.docker.internal:${backendPort}`;
  const endpoints: Record<string, Readonly<Record<string, string>>> = {};
  const environmentOverrides: Record<string, Readonly<Record<string, string>>> = {};
  const environmentOverridesByUnit: Record<
    string,
    Readonly<Record<string, Readonly<Record<string, string>>>>
  > = {};
  for (const entry of inngest) {
    const path =
      profiles.size === 1 ? "/api/inngest" : `/api/inngest/${safeEndpointSegment(entry.profile)}`;
    endpoints[entry.bindingId] = Object.freeze({ serveOrigin: origin, servePath: path });
    environmentOverrides[entry.bindingId] = Object.freeze({ INNGEST_SDK_URL: `${origin}${path}` });
    if (workerEnabled) {
      environmentOverridesByUnit[entry.bindingId] = Object.freeze({
        inngest: Object.freeze({ INNGEST_SDK_URL: `http://worker:3000${path}` }),
      });
    }
  }
  return Object.freeze({
    endpoints: Object.freeze(endpoints),
    environmentOverrides: Object.freeze(environmentOverrides),
    environmentOverridesByUnit: Object.freeze(environmentOverridesByUnit),
  });
}

/**
 * Projects generated worker artifact locations for the selected local bindings.
 * @param services - Accepted local binding plans.
 * @param bindingIds - Bindings whose recipes require a worker.
 * @param buildDirectory - Complete generated build root.
 * @param nodeModulesDirectory - Authored dependency resolution root.
 * @param providerOverridesFile - Secret-protected local worker override file.
 * @returns An immutable artifact map without reading or writing any files.
 */
export function localWorkerArtifacts(
  services: readonly LocalServicePlanEntry[],
  bindingIds: readonly string[],
  buildDirectory: string,
  nodeModulesDirectory: string,
  providerOverridesFile: string,
): Readonly<Record<string, LocalServiceWorkerArtifact>> {
  const selected = new Set(bindingIds);
  const values: Record<string, LocalServiceWorkerArtifact> = {};
  for (const entry of services) {
    if (!selected.has(entry.bindingId)) continue;
    values[entry.bindingId] = {
      entrypoint: join(buildDirectory, "server", "index.js"),
      nodeModulesDirectory,
      providerOverridesFile,
      ...(entry.recipe.integrationId === "inngest"
        ? {
            environment: {
              RELKIT_INNGEST_BASE_URL: "http://inngest:8288",
              RELKIT_INNGEST_SERVE_ORIGIN: "http://worker:3000",
            },
          }
        : {}),
    };
  }
  return Object.freeze(values);
}

export {
  prepareLocalWorkerOverrides,
  prepareLocalWorkerOverridesEffect,
} from "./local-worker-overrides.js";

/** Converts a declared profile name into its portable local HTTP route segment.
 * @param value - Declared profile name.
 * @returns The existing portable Inngest route segment.
 */
function safeEndpointSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/gu, "-");
}
