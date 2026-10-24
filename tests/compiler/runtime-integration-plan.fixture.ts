/** Shares the original deterministic fixture constants and helpers across cohesive runtime-integration-plan cases. */
import { expect } from "bun:test";
import { RuntimeIntegrationPlanError } from "../../packages/compiler/src/index.ts";
import type { ProviderBindingNode } from "../../packages/graph/src/index.ts";
export const source = { file: "src/app.ts", line: 1, column: 1 } as const;

export function provider(
  id: string,
  capability: "bucket" | "cache",
  profile: string,
  integrationId: string,
  adapterId: string,
): ProviderBindingNode {
  return {
    kind: "provider",
    id,
    source,
    capability,
    profile,
    adapter: {
      integrationId,
      adapterId,
      protocolVersion: 1,
      behavior: {},
      connectionContract: {},
      connection: {},
      features: [],
    },
    providerSource: { kind: "connected" },
    namedValues: [],
    deploymentRoles: [],
  };
}

export function registration(capability: string, adapterId: string) {
  return { capability, adapterId, protocolVersion: 1 } as const;
}

export const DEFAULT_REGISTRATIONS: Readonly<
  Record<string, readonly ReturnType<typeof registration>[]>
> = {
  cloudflare: [registration("bucket", "cloudflare-r2"), registration("cache", "cloudflare-kv")],
  redis: [
    registration("agent-state", "redis-agent-state"),
    registration("cache", "redis"),
    registration("realtime", "redis-realtime"),
  ],
  s3: [registration("bucket", "s3")],
};

export function runtimePackage(
  integrationId: string,
  registrations = DEFAULT_REGISTRATIONS[integrationId] ?? [],
) {
  return {
    integrationId,
    packageName: `@relkit/${integrationId}`,
    packageVersion: "0.1.0",
    exportName: "./runtime",
    registrations,
  };
}

export function planEntry(integrationId: string, capability: string, adapterId: string) {
  return {
    integrationId,
    capability,
    adapterId,
    protocolVersion: 1,
    packageName: `@relkit/${integrationId}`,
    packageVersion: "0.1.0",
    exportName: "./runtime",
  };
}

export function expectPlanError(
  run: () => unknown,
  code: RuntimeIntegrationPlanError["code"],
): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(RuntimeIntegrationPlanError);
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected ${code}.`);
}

export function fixtureManifest(exportRuntime: boolean): string {
  return JSON.stringify({
    name: "@fixture/escape",
    version: "1.0.0",
    type: "module",
    exports: { ".": "./index.ts", ...(exportRuntime ? { "./runtime": "./runtime.ts" } : {}) },
    relkit: {
      integration: {
        id: "escape",
        exports: {
          authoring: ".",
          runtime: {
            export: "./runtime",
            registrations: [registration("cache", "escape")],
          },
        },
      },
    },
  });
}
