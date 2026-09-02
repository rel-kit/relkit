import type { RuntimeProviderContext, RuntimeProviderIntegration } from "@relkit/provider";
import { createRedisCacheProvider } from "./provider.js";

export * from "./client.js";
export * from "./provider.js";

export const runtimeIntegration = Object.freeze({
  kind: "runtime-integration",
  integrationId: "redis",
  registrations: Object.freeze([
    {
      capability: "cache",
      adapterId: "redis",
      protocolVersion: 1,
      create: ({ profile, connection, behavior }: RuntimeProviderContext) => {
        const settings = record(behavior, "Redis behavior");
        const provider = createRedisCacheProvider({
          url: text(connection.url, "Redis url"),
          cacheId: profile,
          ...(settings.connectionTimeoutMs === undefined
            ? {}
            : { connectionTimeoutMs: settings.connectionTimeoutMs as number }),
        });
        return { value: provider, ready: provider.ready, release: provider.close };
      },
    },
  ]),
}) satisfies RuntimeProviderIntegration<"redis">;

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} is invalid`);
  return value;
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${label} is invalid`);
  return value as Readonly<Record<string, unknown>>;
}
