import { afterEach, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { useWorkspaceDependencies } from "../../packages/cli/src/local.js";
import { generateProject, normalizeCreateOptions } from "../../packages/create-relkit/src/index.js";

const roots: string[] = [];
const repository = join(import.meta.dir, "../..");
const executable = join(repository, "packages/cli/src/local.ts");

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function run(args: readonly string[], cwd: string): Promise<string> {
  const child = Bun.spawn([process.execPath, ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code, `${stdout}\n${stderr}`).toBe(0);
  return stdout;
}

for (const template of ["agent", "fullstack"]) {
  test(`candidate acceptance installs and validates the ${template} starter with shared native packages`, async () => {
    const temporaryRoot = template === "fullstack" ? join(repository, ".relkit") : tmpdir();
    await mkdir(temporaryRoot, { recursive: true });
    const parent = await mkdtemp(join(temporaryRoot, `relkit-local-${template}-`));
    roots.push(parent);
    const project = join(parent, "app");
    const generated = await generateProject(
      normalizeCreateOptions([
        "app",
        "--directory",
        project,
        "--template",
        template,
        "--cloud",
        "none",
        "--deploy",
        "none",
        "--examples",
        "--no-install",
        "--no-git",
      ]),
      {
        cwd: parent,
        templateRoot: join(repository, "templates/default/v1"),
        bunExecutable: process.execPath,
        relkitExecutable: executable,
      },
    );
    expect(generated).toMatchObject({ installed: false, gitInitialized: false });
    await useWorkspaceDependencies(project);
    await run(["install"], project);
    await run([executable, "check", "--project-root", project], project);
    for (const dependency of ["langchain", "@langchain/langgraph"]) {
      expect(await realpath(join(project, "node_modules", dependency))).toBe(
        await realpath(join(repository, "packages/agents/node_modules", dependency)),
      );
    }
    await run(["run", "typecheck"], project);
    await run(["test"], project);
    if (template === "fullstack") {
      await renderFrontend(project);
      await serveApiWhileFrontendIsDelayed(project);
    }
    // Installing again must retain the shared runtime and native type identities.
    await run(["install", "--frozen-lockfile"], project);
    await run([executable, "check", "--project-root", project], project);
    const added = JSON.parse(
      await run([executable, "--json", "add", "service", "orders", "--full"], project),
    );
    expect(added).toMatchObject({ ok: true, verification: { status: "passed" } });
    const manifest = await Bun.file(join(project, "package.json")).json();
    expect(manifest.dependencies["@relkit/local"]).toBe("link:@relkit/local");
    expect(manifest.dependencies.langchain).toBe("link:langchain");
    await run(["run", "typecheck"], project);
  }, 120_000);
}

async function serveApiWhileFrontendIsDelayed(project: string): Promise<void> {
  const next = join(project, "node_modules/.bin/next");
  const original = `${next}-relkit-test`;
  await rename(next, original);
  await writeFile(next, "#!/usr/bin/env bun\nawait Bun.sleep(30_000);\n");
  await chmod(next, 0o755);
  const apiPort = await availablePort();
  const inspectorPort = await availablePort();
  const child = spawn(process.execPath, ["dev"], {
    cwd: project,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      PORT: String(apiPort),
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
    let response: Response | undefined;
    let body = "";
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        response = await fetch(`http://127.0.0.1:${apiPort}/hello?name=RelKit`, {
          signal: AbortSignal.timeout(1_000),
        });
        body = await response.text();
        if (response.status === 200) break;
      } catch {
        await Bun.sleep(25);
      }
    }
    expect(response?.status, output).toBe(200);
    expect(body).toBe('{"message":"Hello, RelKit!"}');
    expect(child.exitCode, output).toBeNull();
  } finally {
    signalOwnedGroup(child.pid, child.kill.bind(child), "SIGTERM");
    const closedInTime = await Promise.race([
      closed.then(() => true),
      Bun.sleep(5_000).then(() => false),
    ]);
    expect(closedInTime, output).toBe(true);
    await expect(
      fetch(`http://127.0.0.1:${apiPort}/hello`, { signal: AbortSignal.timeout(250) }),
    ).rejects.toThrow();
    await rm(next, { force: true });
    await rename(original, next);
  }
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

async function renderFrontend(project: string): Promise<void> {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port;
  await probe.stop(true);
  const child = Bun.spawn(
    [
      process.execPath,
      join(project, "node_modules/next/dist/bin/next"),
      "dev",
      "web",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { cwd: project, stdout: "pipe", stderr: "pipe" },
  );
  const output = Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  let response: Response | undefined;
  let body = "";
  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && child.exitCode === null) {
      try {
        response = await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(20_000) });
        body = await response.text();
        break;
      } catch {
        await Bun.sleep(50);
      }
    }
  } finally {
    child.kill("SIGTERM");
    await child.exited;
  }
  const logs = (await output).join("\n");
  expect(response?.status, logs).toBe(200);
  expect(body).toContain("<!DOCTYPE html>");
}
