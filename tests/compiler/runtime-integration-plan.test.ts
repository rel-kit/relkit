import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { GRAPH_VERSION, type RuntimeIntegrationPlan } from "../../packages/contracts/src/index.ts";
import {
  generateRuntimeIntegrationImports,
  generateRuntimeIntegrationPlan,
  resolveIntegrationPackageRole,
  resolveRuntimeIntegrationPackages,
  RuntimeIntegrationPlanError,
} from "../../packages/compiler/src/index.ts";
import type { ApplicationGraph, ProviderBindingNode } from "../../packages/graph/src/index.ts";

const source = { file: "src/app.ts", line: 1, column: 1 } as const;

describe("runtime integration plan", () => {
  test("emits only graph-required runtimes in stable registration order", () => {
    const graph: ApplicationGraph = {
      contractVersion: GRAPH_VERSION,
      appId: "commerce",
      nodes: [
        provider("provider.cache.unused", "cache", "unused", "cloudflare", "cloudflare-kv"),
        provider("provider.cache.timeline", "cache", "timeline", "redis", "redis"),
        provider("provider.bucket.assets", "bucket", "assets", "s3", "s3"),
        provider("provider.cache.requests", "cache", "requests", "redis", "redis"),
      ],
      edges: [
        { kind: "uses-provider-profile", from: "timeline", to: "provider.cache.timeline" },
        { kind: "uses-provider-profile", from: "assets", to: "provider.bucket.assets" },
        { kind: "uses-provider-profile", from: "requests", to: "provider.cache.requests" },
      ],
    };
    const plan = generateRuntimeIntegrationPlan(graph, "sha256:graph", [
      runtimePackage("redis"),
      runtimePackage("s3"),
      runtimePackage("cloudflare"),
    ]);

    expect(plan).toEqual({
      version: 1,
      graphHash: "sha256:graph",
      integrations: [
        {
          integrationId: "s3",
          capability: "bucket",
          adapterId: "s3",
          protocolVersion: 1,
          packageName: "@relkit/s3",
          packageVersion: "0.1.0",
          exportName: "./runtime",
        },
        {
          integrationId: "redis",
          capability: "cache",
          adapterId: "redis",
          protocolVersion: 1,
          packageName: "@relkit/redis",
          packageVersion: "0.1.0",
          exportName: "./runtime",
        },
      ],
    });
  });

  test("resolves standalone provenance through catalog metadata", () => {
    const packages = resolveRuntimeIntegrationPackages({
      projectRoot: resolve(process.cwd(), "integrations/catalog"),
      imports: ["@relkit/integrations/s3", "@relkit/integrations/redis"],
    });
    expect(packages).toEqual([runtimePackage("redis"), runtimePackage("s3")]);
    expect(
      resolveIntegrationPackageRole({
        projectRoot: resolve(process.cwd(), "integrations/catalog"),
        packageName: "@relkit/redis",
        integrationId: "redis",
        role: "localRecipe",
      }),
    ).toMatchObject({ packageName: "@relkit/redis", exportName: "./local-recipe" });
    expect(
      resolveIntegrationPackageRole({
        projectRoot: resolve(process.cwd(), "integrations/catalog"),
        packageName: "@relkit/pulumi",
        integrationId: "pulumi",
        role: "engine",
      }),
    ).toMatchObject({ packageName: "@relkit/pulumi", exportName: "./engine" });
    expect(
      resolveIntegrationPackageRole({
        projectRoot: resolve(process.cwd(), "integrations/catalog"),
        packageName: "@relkit/aws",
        integrationId: "aws",
        role: "infrastructure",
      }),
    ).toMatchObject({ packageName: "@relkit/aws", exportName: "./infrastructure" });
  });

  test("rejects mismatched identities and duplicate runtime registrations", () => {
    const graph: ApplicationGraph = {
      contractVersion: GRAPH_VERSION,
      appId: "commerce",
      nodes: [provider("provider.cache.primary", "cache", "primary", "redis", "redis")],
      edges: [{ kind: "uses-provider-profile", from: "requests", to: "provider.cache.primary" }],
    };
    expectPlanError(
      () =>
        generateRuntimeIntegrationPlan(graph, "sha256:graph", [
          runtimePackage("redis", [registration("cache", "other")]),
        ]),
      "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID",
    );
    expectPlanError(
      () =>
        generateRuntimeIntegrationPlan(graph, "sha256:graph", [
          runtimePackage("redis"),
          { ...runtimePackage("redis"), packageName: "@other/redis" },
        ]),
      "RELKIT_RUNTIME_INTEGRATION_IDENTITY_INVALID",
    );

    const duplicateGraph: ApplicationGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        provider("provider.cache.secondary", "cache", "secondary", "redis-copy", "redis"),
      ],
      edges: [
        ...graph.edges,
        { kind: "uses-provider-profile", from: "timeline", to: "provider.cache.secondary" },
      ],
    };
    expectPlanError(
      () =>
        generateRuntimeIntegrationPlan(duplicateGraph, "sha256:graph", [
          runtimePackage("redis"),
          runtimePackage("redis-copy", [registration("cache", "redis")]),
        ]),
      "RELKIT_RUNTIME_INTEGRATION_REGISTRATION_DUPLICATE",
    );
  });

  test("generates one deterministic static import per selected package export", () => {
    const plan: RuntimeIntegrationPlan = {
      version: 1,
      graphHash: "sha256:graph",
      integrations: [
        planEntry("cloudflare", "cache", "cloudflare-kv"),
        planEntry("redis", "cache", "redis"),
        planEntry("cloudflare", "bucket", "cloudflare-r2"),
      ],
    };
    const source = generateRuntimeIntegrationImports(plan);
    expect(
      generateRuntimeIntegrationImports({
        ...plan,
        integrations: [...plan.integrations].reverse(),
      }),
    ).toBe(source);
    expect(source.match(/^import /gm)).toHaveLength(2);
    expect(source).toContain('from "@relkit/cloudflare/runtime";');
    expect(source).toContain('from "@relkit/redis/runtime";');
  });

  test("rejects authored runtime paths and package-root escapes", async () => {
    expect(() =>
      resolveRuntimeIntegrationPackages({
        projectRoot: resolve(process.cwd(), "integrations/catalog"),
        imports: ["@relkit/redis/runtime"],
      }),
    ).toThrow("not an authoring export");

    const projectRoot = await mkdtemp(join(tmpdir(), "relkit-integration-package-"));
    const packageRoot = join(projectRoot, "node_modules", "@fixture", "escape");
    const manifestPath = join(packageRoot, "package.json");
    try {
      await mkdir(packageRoot, { recursive: true });
      await writeFile(join(packageRoot, "index.ts"), "export {};\n");
      const outside = join(projectRoot, "outside.ts");
      await writeFile(outside, "export {};\n");
      await symlink(outside, join(packageRoot, "runtime.ts"));
      await writeFile(manifestPath, fixtureManifest(false));
      expect(() =>
        resolveRuntimeIntegrationPackages({ projectRoot, imports: ["@fixture/escape"] }),
      ).toThrow('does not export "./runtime"');
      await writeFile(manifestPath, fixtureManifest(true));
      expect(() =>
        resolveRuntimeIntegrationPackages({ projectRoot, imports: ["@fixture/escape"] }),
      ).toThrow();
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
});

function provider(
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

function registration(capability: string, adapterId: string) {
  return { capability, adapterId, protocolVersion: 1 } as const;
}

const DEFAULT_REGISTRATIONS: Readonly<Record<string, readonly ReturnType<typeof registration>[]>> =
  {
    cloudflare: [registration("bucket", "cloudflare-r2"), registration("cache", "cloudflare-kv")],
    redis: [registration("cache", "redis")],
    s3: [registration("bucket", "s3")],
  };

function runtimePackage(
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

function planEntry(integrationId: string, capability: string, adapterId: string) {
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

function expectPlanError(run: () => unknown, code: RuntimeIntegrationPlanError["code"]): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(RuntimeIntegrationPlanError);
    expect(error).toMatchObject({ code });
    return;
  }
  throw new Error(`Expected ${code}.`);
}

function fixtureManifest(exportRuntime: boolean): string {
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
