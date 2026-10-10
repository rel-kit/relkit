import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
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
    const registryEnvironment = {
      ...process.env,
      BUN_CONFIG_REGISTRY: registry,
      npm_config_registry: registry,
      BUN_INSTALL_CACHE_DIR: join(parent, "cache"),
    };
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
        "--examples",
        "--no-git",
        "--install",
      ],
      {
        cwd: parent,
        env: registryEnvironment,
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
      expect(manifest.dependencies).toEqual({
        "@relkit/app": cliManifest.version,
        effect: cliManifest.relkit.buildCatalog.effectVersion,
      });
      expect(manifest.devDependencies["@relkit/cli"]).toBe(cliManifest.version);
      expect(manifest.devDependencies["@relkit/testing"]).toBe(cliManifest.version);
      expect(
        Object.keys(manifest.devDependencies).filter((name) => name.startsWith("@relkit/")),
      ).toHaveLength(2);
      expect(await readFile(join(project, "bun.lock"), "utf8")).not.toContain("link:");
      const pointer = join(project, ".relkit/dev/current.json");
      const before = await stat(pointer);
      const launched = await launchPreparedProject(project);
      expect(launched.body).toBe('{"message":"Hello, RelKit!"}');
      expect(launched.durationMs).toBeLessThan(5_000);
      const after = await stat(pointer);
      expect({ mtimeMs: after.mtimeMs, size: after.size }).toEqual({
        mtimeMs: before.mtimeMs,
        size: before.size,
      });
      await chmod(pointer, 0o600);
      await writeFile(pointer, "{\n");
      expect((await launchPreparedProject(project)).body).toBe('{"message":"Hello, RelKit!"}');
      const manual = join(parent, "manual");
      const created = JSON.parse(
        await runCommand(
          process.execPath,
          [
            join(import.meta.dir, "../../packages/cli/src/bin.ts"),
            "create",
            "manual",
            "--directory",
            manual,
            "--template",
            "minimal",
            "--cloud",
            "none",
            "--deploy",
            "none",
            "--json",
            "--examples",
            "--no-git",
            "--no-install",
          ],
          parent,
          registryEnvironment,
        ),
      );
      expect(created.nextSteps.commands).toMatchObject({
        install: "bun install",
        prepare: "bunx --no-install relkit dev --prepare",
        dev: "bun run dev",
      });
      await runCommand(process.execPath, ["install"], manual, registryEnvironment);
      expect(
        await runCommand(
          process.execPath,
          ["x", "--no-install", "relkit", "dev", "--prepare"],
          manual,
          registryEnvironment,
        ),
      ).toContain("Prepared development snapshot");
      expect((await launchPreparedProject(manual)).body).toBe('{"message":"Hello, RelKit!"}');
      await runCommand(
        process.execPath,
        ["install", "--frozen-lockfile"],
        manual,
        registryEnvironment,
      );
      for (const script of ["check", "typecheck", "test", "build"] as const) {
        await runCommand(process.execPath, ["run", script], manual, registryEnvironment);
      }
      expect((await launchPreparedProject(manual, "start")).body).toBe(
        '{"message":"Hello, RelKit!"}',
      );
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

async function runCommand(
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

async function launchPreparedProject(
  project: string,
  script: "dev" | "start" = "dev",
): Promise<{ readonly body: string; readonly durationMs: number }> {
  const port = await availablePort();
  const inspectorPort = await availablePort();
  const startedAt = performance.now();
  const child = spawn(process.execPath, [script], {
    cwd: project,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      PORT: String(port),
      RELKIT_INSPECTOR_PORT: String(inspectorPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  try {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/hello?name=RelKit`, {
          signal: AbortSignal.timeout(1_000),
        });
        const body = await response.text();
        if (response.status === 200) {
          const subsequent = await fetch(`http://127.0.0.1:${port}/hello?name=Again`, {
            signal: AbortSignal.timeout(1_000),
          });
          expect(subsequent.status).toBe(200);
          expect(await subsequent.text()).toBe('{"message":"Hello, Again!"}');
          if (script === "dev") await expectDevelopmentSurfaces(port, inspectorPort);
          return { body, durationMs: performance.now() - startedAt };
        }
      } catch {
        await Bun.sleep(25);
      }
    }
    throw new Error(`Prepared project did not become ready.\n${output}`);
  } finally {
    signalOwnedGroup(child.pid, child.kill.bind(child), "SIGTERM");
    const closedInTime = await Promise.race([
      closed.then(() => true),
      Bun.sleep(5_000).then(() => false),
    ]);
    expect(closedInTime, output).toBe(true);
    await expect(
      fetch(`http://127.0.0.1:${port}/hello`, { signal: AbortSignal.timeout(250) }),
    ).rejects.toThrow();
  }
}

async function expectDevelopmentSurfaces(port: number, inspectorPort: number): Promise<void> {
  const graph = await fetch(`http://127.0.0.1:${port}/_relkit/v1/graph`);
  expect(graph.status).toBe(200);
  expect(await graph.json()).toMatchObject({ protocol: "relkit.inspector" });
  const openapi = await fetch(`http://127.0.0.1:${port}/_relkit/v1/openapi.json`);
  const document = (await openapi.json()) as { readonly paths?: Record<string, unknown> };
  expect(openapi.status).toBe(200);
  expect(document.paths).toHaveProperty("/hello");
  const reference = await fetch(`http://127.0.0.1:${port}/_relkit/v1/api-reference`);
  expect(reference.status).toBe(200);
  expect(await reference.text()).toContain("RELKIT API Reference");
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const inspector = await fetch(`http://127.0.0.1:${inspectorPort}`, {
        signal: AbortSignal.timeout(1_000),
      });
      const html = await inspector.text();
      if (inspector.status === 200) {
        expect(html).toContain("RELKIT Inspector");
        return;
      }
    } catch {
      await Bun.sleep(25);
    }
  }
  throw new Error("Packaged inspector did not become ready.");
}

function signalOwnedGroup(
  pid: number | undefined,
  kill: (signal?: NodeJS.Signals | number) => boolean,
  signal: NodeJS.Signals,
): void {
  try {
    if (process.platform === "win32") kill(signal);
    else if (pid !== undefined) process.kill(-pid, signal);
  } catch (cause) {
    if (!(cause instanceof Error && "code" in cause && cause.code === "ESRCH")) throw cause;
  }
}

async function availablePort(): Promise<number> {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
  const port = server.port;
  await server.stop(true);
  return port;
}
