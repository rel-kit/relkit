import { join } from "node:path";
import type { LocalServicePlanEntry, LocalServiceWorkerArtifact } from "@relkit/local-service";

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
    const path = profiles.size === 1 ? "/api/inngest" : `/api/inngest/${safeEndpointSegment(entry.profile)}`;
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

export function localWorkerArtifacts(
  services: readonly LocalServicePlanEntry[],
  bindingIds: readonly string[],
  buildDirectory: string,
  providerOverridesFile: string,
): Readonly<Record<string, LocalServiceWorkerArtifact>> {
  const selected = new Set(bindingIds);
  const values: Record<string, LocalServiceWorkerArtifact> = {};
  for (const entry of services) {
    if (!selected.has(entry.bindingId)) continue;
    values[entry.bindingId] = {
      entrypoint: join(buildDirectory, "server", "index.js"),
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

function safeEndpointSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/gu, "-");
}
