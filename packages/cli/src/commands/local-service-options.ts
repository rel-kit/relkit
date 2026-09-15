import type { LocalServicePlanEntry } from "@relkit/local-service";

export function localServiceRuntimeOptions(
  services: readonly LocalServicePlanEntry[],
  backendPort: number,
): {
  readonly endpoints: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly environmentOverrides: Readonly<Record<string, Readonly<Record<string, string>>>>;
} {
  if (!Number.isSafeInteger(backendPort) || backendPort < 1 || backendPort > 65535) {
    throw new Error("The local backend port is invalid.");
  }
  const inngest = services.filter((entry) => entry.recipe.integrationId === "inngest");
  const profiles = new Set(inngest.map((entry) => entry.profile));
  const origin = `http://host.docker.internal:${backendPort}`;
  const endpoints: Record<string, Readonly<Record<string, string>>> = {};
  const environmentOverrides: Record<string, Readonly<Record<string, string>>> = {};
  for (const entry of inngest) {
    const path = profiles.size === 1 ? "/api/inngest" : `/api/inngest/${safeEndpointSegment(entry.profile)}`;
    endpoints[entry.bindingId] = Object.freeze({ serveOrigin: origin, servePath: path });
    environmentOverrides[entry.bindingId] = Object.freeze({ INNGEST_SDK_URL: `${origin}${path}` });
  }
  return Object.freeze({
    endpoints: Object.freeze(endpoints),
    environmentOverrides: Object.freeze(environmentOverrides),
  });
}

function safeEndpointSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/gu, "-");
}
