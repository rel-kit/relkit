/** Owns the actual packed CLI registry, independent archive identities and finite native command fixtures. */
import { expect } from "bun:test";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { packAll } from "../../scripts/release-check-artifacts.js";
import { packages } from "../../scripts/release-check-support.js";
import {
  loadReleaseTarballs,
  readManifests,
  readPackedManifest,
  startRegistry,
} from "../../scripts/pack-and-smoke-create-relkit-pack.js";
import { Effect, Schema } from "effect";
import { verifyConsumerArchives } from "../../scripts/consumer-artifact-verification.js";

const InstalledCliManifest = Schema.fromJsonString(
  Schema.Struct({ name: Schema.Literal("@relkit/cli"), version: Schema.String }),
);

/** Reuses supplied verified release archives or preserves the original complete packing path. */
export async function installedCliFixture(parent: string, artifactDirectory?: string) {
  const artifacts = artifactDirectory ?? join(parent, "artifacts");
  let tarballs: Map<string, string>;
  if (artifactDirectory === undefined) {
    const packed = await packAll(await packages(), artifacts);
    tarballs = new Map(packed.map(({ name, file }) => [name, join(artifacts, file)]));
  } else {
    await Effect.runPromise(verifyConsumerArchives(artifacts));
    tarballs = await loadReleaseTarballs(artifacts);
  }
  const manifests = await readManifests(resolve(import.meta.dir, "../.."));
  const appVersion = (await readPackedManifest(tarballs.get("@relkit/app")!)).version;
  const testingVersion = (await readPackedManifest(tarballs.get("@relkit/testing")!)).version;
  const packedCli = await readPackedManifest(tarballs.get("@relkit/cli")!);
  const server = await startRegistry(parent, tarballs, manifests);
  const registry = `http://127.0.0.1:${server.port!}`;
  const env = {
    ...process.env,
    BUN_CONFIG_REGISTRY: registry,
    npm_config_registry: registry,
    BUN_INSTALL_CACHE_DIR: join(parent, "cache"),
  };
  try {
    const cliBin = await installCandidateCli(parent, packedCli.version, env);
    return {
      parent,
      project: join(parent, "app"),
      appVersion,
      testingVersion,
      packedCli,
      server,
      env,
      cliBin,
    };
  } catch (cause) {
    await server.stop(true);
    throw cause;
  }
}

export type InstalledCliFixture = Awaited<ReturnType<typeof installedCliFixture>>;

/** Installs the verified candidate CLI before invoking its real published binary. */
async function installCandidateCli(parent: string, version: string, env: NodeJS.ProcessEnv) {
  await writeFile(
    join(parent, "package.json"),
    JSON.stringify({ private: true, type: "module", devDependencies: { "@relkit/cli": version } }),
  );
  await installedCliCommand(process.execPath, ["install", "--ignore-scripts"], parent, env);
  const installed = Schema.decodeUnknownSync(InstalledCliManifest)(
    await readFile(join(parent, "node_modules/@relkit/cli/package.json"), "utf8"),
  );
  expect(installed.version).toBe(version);
  return join(parent, "node_modules/@relkit/cli/dist/bin.js");
}

/** Retains the exact supported create flags for installed and manual preparation scenarios. */
export function installedCreateArguments(
  cliBin: string,
  name: string,
  destination: string,
  install: boolean,
): string[] {
  return [
    cliBin,
    "create",
    name,
    "--directory",
    destination,
    "--template",
    "minimal",
    "--cloud",
    "none",
    "--deploy",
    "none",
    "--json",
    "--examples",
    "--no-git",
    install ? "--install" : "--no-install",
  ];
}

/** Requires an uncertified tuple to reject without creating its destination. */
export async function rejectUnsupportedInstalledCreate(fixture: InstalledCliFixture) {
  const unsupported = join(fixture.parent, "unsupported");
  const rejected = Bun.spawn(
    [
      process.execPath,
      fixture.cliBin,
      "create",
      "unsupported",
      "--directory",
      unsupported,
      "--template",
      "agent",
      "--no-install",
      "--no-git",
      "--json",
    ],
    {
      cwd: fixture.parent,
      env: fixture.env,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [output, error, code] = await Promise.all([
    new Response(rejected.stdout).text(),
    new Response(rejected.stderr).text(),
    rejected.exited,
  ]);
  expect(code, error).toBe(2);
  expect(JSON.parse(output).error).toMatchObject({
    code: "RELKIT_CREATE_USAGE",
    message: expect.stringContaining("not certified"),
  });
  await expect(stat(unsupported)).rejects.toMatchObject({ code: "ENOENT" });
}

/** Joins the original finite command and both native output streams. */
export async function installedCliCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  const child = Bun.spawn([command, ...args], {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
  return stdout;
}

/** Reads the generated manifest without substituting a shared release version. */
export async function assertInstalledManifest(fixture: InstalledCliFixture) {
  const manifest = JSON.parse(await readFile(join(fixture.project, "package.json"), "utf8"));
  expect(manifest.dependencies).toEqual({
    "@relkit/app": fixture.appVersion,
    "@scalar/hono-api-reference": "0.12.9",
    effect: fixture.packedCli.dependencies?.effect,
  });
  expect(manifest.devDependencies["@relkit/cli"]).toBe(fixture.packedCli.version);
  expect(manifest.devDependencies["@relkit/testing"]).toBe(fixture.testingVersion);
  expect(
    Object.keys(manifest.devDependencies).filter((name) => name.startsWith("@relkit/")),
  ).toHaveLength(2);
  expect(await readFile(join(fixture.project, "bun.lock"), "utf8")).not.toContain("link:");
  expect(() => Bun.resolveSync("@scalar/hono-api-reference", fixture.project)).not.toThrow();
}
