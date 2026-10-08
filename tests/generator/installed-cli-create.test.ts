import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import cliManifest from "../../packages/cli/package.json" with { type: "json" };
import { packAll } from "../../scripts/release-check-artifacts.js";
import { packages } from "../../scripts/release-check-support.js";
import { readManifests, startRegistry } from "../../scripts/pack-and-smoke-create-relkit-pack.js";

test("normal CLI installs external projects from packed packages without contributor links", async () => {
  const parent = await mkdtemp(join(tmpdir(), "relkit-npm-create-"));
  const project = join(parent, "app");
  let server: ReturnType<typeof Bun.serve> | undefined;
  try {
    const artifacts = join(parent, "artifacts");
    const packed = await packAll(await packages(), cliManifest.version, artifacts);
    const tarballs = new Map(packed.map(({ name, file }) => [name, join(artifacts, file)]));
    const manifests = await readManifests(resolve(import.meta.dir, "../.."));
    server = await startRegistry(parent, tarballs, manifests);
    const registry = `http://127.0.0.1:${server.port!}`;
    const child = Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, "../../packages/cli/src/bin.ts"),
        "create",
        "app",
        "--directory",
        project,
        "--template",
        "minimal",
        "--cloud",
        "none",
        "--deploy",
        "none",
        "--json",
        "--no-examples",
        "--no-git",
        "--install",
      ],
      {
        cwd: parent,
        env: {
          ...process.env,
          BUN_CONFIG_REGISTRY: registry,
          npm_config_registry: registry,
          BUN_INSTALL_CACHE_DIR: join(parent, "cache"),
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const output = Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    try {
      expect(await child.exited, (await output).join("\n")).toBe(0);
      const manifest = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
      expect(manifest.dependencies).toEqual({ "@relkit/app": cliManifest.version });
      expect(manifest.devDependencies["@relkit/cli"]).toBe(cliManifest.version);
      expect(manifest.devDependencies["@relkit/testing"]).toBe(cliManifest.version);
      expect(
        Object.keys(manifest.devDependencies).filter((name) => name.startsWith("@relkit/")),
      ).toHaveLength(2);
      expect(await readFile(join(project, "bun.lock"), "utf8")).not.toContain("link:");
    } finally {
      if (child.exitCode === null) child.kill();
      await child.exited;
      await output;
    }
  } finally {
    if (server !== undefined) await server.stop(true);
    await rm(parent, { recursive: true, force: true });
  }
}, 360_000);
