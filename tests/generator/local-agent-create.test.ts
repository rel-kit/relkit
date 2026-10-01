import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  test(`local create installs and validates the ${template} starter with shared native packages`, async () => {
    const temporaryRoot = template === "fullstack" ? join(repository, ".relkit") : tmpdir();
    await mkdir(temporaryRoot, { recursive: true });
    const parent = await mkdtemp(join(temporaryRoot, `relkit-local-${template}-`));
    roots.push(parent);
    const project = join(parent, "app");
    const output = await run(
      [
        executable,
        "--json",
        "create",
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
        "--install",
        "--git",
      ],
      parent,
    );
    expect(JSON.parse(output)).toMatchObject({ ok: true, installed: true, gitInitialized: true });
    for (const dependency of ["langchain", "@langchain/langgraph"]) {
      expect(await realpath(join(project, "node_modules", dependency))).toBe(
        await realpath(join(repository, "packages/agents/node_modules", dependency)),
      );
    }
    await run(["run", "typecheck"], project);
    await run(["test"], project);
    if (template === "fullstack") await renderFrontend(project);
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
