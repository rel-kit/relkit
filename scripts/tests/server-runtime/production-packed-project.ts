/** Builds real candidate packages and installs only the emitted production closure. */
import { strict as assert } from "node:assert";
import { cp, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Effect } from "effect";
import { inspectInstallation } from "../../consumer-installation.js";
import { runCommand } from "../../pack-and-smoke-create-relkit-support.js";
import { readManifests } from "../../pack-and-smoke-create-relkit-pack.js";

/**
 * Installs the actual packed CLI once, then builds native and minimal cohorts independently.
 * @param root - Owned acceptance fixture or relocated application root.
 * @param registry - Candidate registry origin serving only verified first-party tarballs.
 * @param manifests - Current workspace release package identities and source locations.
 * @returns Independent native and minimal installations after deleting their developer fixture.
 */
export async function preparePackedProduction(
  root: string,
  registry: string,
  manifests: Awaited<ReturnType<typeof readManifests>>,
) {
  const developer = join(root, "developer");
  await cp(
    resolve(import.meta.dirname, "../../../packages/cli/tests/server-runtime/production-app"),
    developer,
    { recursive: true },
  );
  const version = (name: string) => {
    const value = manifests.get(name)?.manifest.version;
    if (value === undefined) throw new Error(`Missing candidate package ${name}`);
    return value;
  };
  await writeFile(
    join(developer, "package.json"),
    JSON.stringify({
      name: "relkit-production-proof",
      private: true,
      type: "module",
      dependencies: {
        "@relkit/app": version("@relkit/app"),
        "@relkit/local": version("@relkit/local"),
        "@scalar/hono-api-reference": "0.12.9",
      },
      devDependencies: { "@relkit/cli": version("@relkit/cli") },
    }),
  );
  await install(developer, registry, join(root, "developer-cache"), false);
  const native = await buildAndInstall(root, developer, registry, "native");
  await minimalSources(developer);
  const minimal = await buildAndInstall(root, developer, registry, "minimal");
  await rm(developer, { recursive: true, force: true });
  return { native, minimal };
}

/**
 * Moves output before installing it, so subsequent builds cannot supply missing runtime files.
 * @param root - Owned acceptance fixture or relocated application root.
 * @param developer - Isolated developer fixture containing the installed candidate CLI.
 * @param registry - Candidate registry origin serving only verified first-party tarballs.
 * @param variant - Fixture identity distinguishing native, minimal and authentication cohorts.
 * @returns The relocated production root and audited physical installed package identities.
 */
export async function buildAndInstall(
  root: string,
  developer: string,
  registry: string,
  variant: string,
) {
  await runCommand(
    ["run", "--no-env-file", "node_modules/@relkit/cli/dist/bin.js", "build"],
    developer,
  );
  const destination = join(root, variant);
  const build = join(destination, ".relkit/build");
  await mkdir(join(destination, ".relkit"), { recursive: true });
  await rename(join(developer, ".relkit/build"), build);
  await install(build, registry, join(root, `${variant}-cache`), true);
  const installation = await Effect.runPromise(inspectInstallation(build));
  assert.deepEqual(installation.missing, []);
  const forbidden =
    /^(?:@relkit\/(?:cli|compiler|inspector-api|observability-local|deploy|deploy-pulumi|pulumi|langchain|deepagents)$|@duckdb\/|@pulumi\/|@langchain\/|@ag-ui\/|@modelcontextprotocol\/|langchain$|langsmith$|deepagents$|next$|react(?:-dom)?$)/;
  assert.deepEqual(
    installation.instances.filter((entry) => forbidden.test(entry.name)).map((entry) => entry.name),
    [],
  );
  if (variant === "minimal")
    assert.equal(
      installation.instances.some((entry) => entry.name === "@scalar/hono-api-reference"),
      false,
    );
  if (variant === "auth") {
    const fetch = installation.instances.filter((entry) => entry.name === "@better-fetch/fetch");
    assert.ok(fetch.length > 0);
    assert.ok(fetch.every((entry) => entry.version === "1.3.2"));
  }
  const relocated = join(root, `${variant}-relocated`);
  await rename(destination, relocated);
  return {
    root: relocated,
    packages: installation.instances.map((entry) => `${entry.name}@${entry.version}`),
  };
}

/**
 * Uses Bun's actual isolated layout and one install/script worker for both installations.
 * @param root - Owned acceptance fixture or relocated application root.
 * @param registry - Candidate registry origin serving only verified first-party tarballs.
 * @param cache - Fixture-owned Bun cache for this installation.
 * @param production - Whether to install only the emitted normal production dependencies.
 * @returns After the isolated bounded Bun installation physically settles or reports its native failure.
 */
export async function install(root: string, registry: string, cache: string, production: boolean) {
  await runCommand(
    [
      "install",
      "--linker",
      "isolated",
      "--network-concurrency",
      "1",
      "--concurrent-scripts",
      "1",
      ...(production ? ["--production"] : []),
    ],
    root,
    registry,
    cache,
  );
}

/**
 * Replaces only fixture-owned descriptors; the native build has already been moved intact.
 * @param root - Owned acceptance fixture or relocated application root.
 * @returns After replacing only owned descriptors with the minimal application variant.
 */
async function minimalSources(root: string) {
  await rm(join(root, "src/services/probe/tasks/double.task.ts"));
  await writeFile(
    join(root, "relkit.config.ts"),
    'import { defineApp, defineEnv } from "@relkit/app/config"; export default defineApp({ id: "production-minimal", env: defineEnv({}) });\n',
  );
  await writeFile(
    join(root, "src/services/probe/service.ts"),
    'import { defineService } from "@relkit/app/services"; import submit from "./functions/submit.function.js"; export default defineService({ functions: { submit } });\n',
  );
  await writeFile(
    join(root, "src/services/probe/functions/submit.function.ts"),
    'import { defineFunction } from "@relkit/app/functions"; import { z } from "@relkit/app/schema"; export default defineFunction({ id: "probe.submit", input: z.object({ value: z.number() }), output: z.object({ doubled: z.number() }), handler: async ({ value }) => ({ doubled: value * 2 }) });\n',
  );
}
