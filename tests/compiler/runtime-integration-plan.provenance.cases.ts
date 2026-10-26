/** Retains original provenance assertions for runtime-integration-plan, registered by the owning suite. */
import { expect } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import redisManifest from "../../integrations/packages/redis/package.json";
import s3Manifest from "../../integrations/packages/s3/package.json";
import {
  resolveIntegrationPackageRole,
  resolveRuntimeIntegrationPackages,
} from "../../packages/compiler/src/index.ts";
import { runtimePackage, fixtureManifest } from "./runtime-integration-plan.fixture.js";
export async function case2Provenance() {
  const projectRoot = await mkdtemp(join(tmpdir(), "relkit-selected-integrations-"));
  await mkdir(join(projectRoot, "node_modules/@relkit"), { recursive: true });
  try {
    await seedSelectedIntegrations(projectRoot);
    const packages = resolveRuntimeIntegrationPackages({
      projectRoot,
      imports: ["@relkit/s3", "@relkit/redis"],
    });
    expect(packages).toEqual([
      { ...runtimePackage("redis"), packageVersion: redisManifest.version },
      { ...runtimePackage("s3"), packageVersion: s3Manifest.version },
    ]);
    expect(
      resolveIntegrationPackageRole({
        projectRoot,
        packageName: "@relkit/redis",
        integrationId: "redis",
        role: "localRecipe",
      }),
    ).toMatchObject({ packageName: "@relkit/redis", exportName: "./local-recipe" });
    expect(
      resolveIntegrationPackageRole({
        projectRoot,
        packageName: "@relkit/pulumi",
        integrationId: "pulumi",
        role: "engine",
      }),
    ).toMatchObject({ packageName: "@relkit/pulumi", exportName: "./engine" });
    expect(
      resolveIntegrationPackageRole({
        projectRoot,
        packageName: "@relkit/aws",
        integrationId: "aws",
        role: "infrastructure",
      }),
    ).toMatchObject({ packageName: "@relkit/aws", exportName: "./infrastructure" });
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

/** Writes the same project-owned declarations and links only its explicitly selected packages. */
async function seedSelectedIntegrations(projectRoot: string) {
  await writeFile(
    join(projectRoot, "package.json"),
    JSON.stringify({
      devDependencies: {
        "@relkit/redis": redisManifest.version,
        "@relkit/s3": s3Manifest.version,
        "@relkit/aws": "workspace:*",
        "@relkit/pulumi": "workspace:*",
      },
    }),
  );
  for (const name of ["redis", "s3", "aws", "pulumi"])
    await symlink(
      resolve(process.cwd(), "integrations/packages", name),
      join(projectRoot, "node_modules/@relkit", name),
    );
}

export async function case5Provenance() {
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
}
