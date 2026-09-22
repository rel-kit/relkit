import { randomUUID } from "node:crypto";
import { chmod, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { serializeJson, type JsonValue } from "@relkit/contracts";
import {
  assertProviderOverrideStateVersion,
  type LocalServicePlanEntry,
  type LocalServiceWorkerArtifact,
  type ProviderOverrideState,
} from "@relkit/local-service";

const LOOPBACK_URL_HOST =
  /^(?<scheme>[a-z][a-z\d+.-]*:\/\/)(?:127\.0\.0\.1|localhost|\[::1\])(?=[:/?#]|$)/iu;

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

export async function prepareLocalWorkerOverrides(providerOverridesFile: string): Promise<string> {
  const source = JSON.parse(await readFile(providerOverridesFile, "utf8")) as unknown;
  assertProviderOverrideStateVersion(source);
  const rewritten: ProviderOverrideState = {
    ...source,
    bindings: source.bindings.map((binding) => ({
      ...binding,
      values: rewriteWorkerValues(binding.values),
    })),
  };
  const target = join(dirname(providerOverridesFile), "worker-provider-overrides.json");
  const temporary = join(dirname(target), `.worker-overrides-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${serializeJson(rewritten)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporary, target);
    await chmod(target, 0o600);
  } finally {
    await rm(temporary, { force: true });
  }
  return target;
}

function rewriteWorkerValues(
  values: Readonly<Record<string, JsonValue>>,
): Readonly<Record<string, JsonValue>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, rewriteWorkerValue(value)]),
    ),
  );
}

function rewriteWorkerValue(value: JsonValue): JsonValue {
  if (typeof value === "string")
    return value.replace(LOOPBACK_URL_HOST, "$<scheme>host.docker.internal");
  if (Array.isArray(value)) return value.map(rewriteWorkerValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, rewriteWorkerValue(nested)]),
    );
  }
  return value;
}

function safeEndpointSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/gu, "-");
}
