import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { versionChecks } from "../../packages/cli/src/commands/doctor-compat.js";
import { useWorkspaceDependencies } from "../../packages/cli/src/local.js";
import appManifest from "../../packages/app/package.json" with { type: "json" };
import { generateProject, normalizeCreateOptions } from "../../packages/create-relkit/src/index.ts";
import { runScaffoldTerminal } from "../../scripts/scaffold-smoke-terminal.ts";

const roots: string[] = [];

test("local create preserves the staged interactive addition prompt", async () => {
  const parent = await mkdtemp(join(tmpdir(), "relkit-local-create-terminal-"));
  roots.push(parent);
  const result = await runScaffoldTerminal(
    [
      join(import.meta.dir, "../../packages/cli/src/local.ts"),
      "create",
      "app",
      "--directory",
      join(parent, "app"),
      "--template",
      "minimal",
      "--cloud",
      "none",
      "--deploy",
      "none",
      "--no-install",
      "--no-git",
      "--examples",
    ],
    parent,
    [["Add an artifact before finishing?", "n\r"]],
  );
  expect(result.code, result.output).toBe(0);
  expect(await Bun.file(join(parent, "app/package.json")).exists()).toBe(true);
}, 60_000);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("local create replaces only RELKIT package versions with Bun links", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-local-workspace-"));
  roots.push(root);
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({
      dependencies: { "@relkit/app": appManifest.version, hono: "4.11.7" },
      devDependencies: { "@relkit/cli": appManifest.version, typescript: "5.9.3" },
    })}\n`,
  );

  const names = await useWorkspaceDependencies(root);
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

  expect(names).toContain("@relkit/app");
  expect(names).toContain("@relkit/cli");
  expect(names).toContain("@relkit/engine");
  expect(manifest.dependencies).toEqual({ "@relkit/app": "link:@relkit/app", hono: "4.11.7" });
  expect(manifest.devDependencies).toMatchObject({
    "@relkit/cli": "link:@relkit/cli",
    "@relkit/engine": "link:@relkit/engine",
    typescript: "5.9.3",
  });
});

test("doctor accepts local RELKIT package links", async () => {
  const checks = await versionChecks(
    {
      packageManager: `bun@${Bun.version}`,
      dependencies: { "@relkit/app": "link:@relkit/app" },
      devDependencies: { "@relkit/cli": "link:@relkit/cli", typescript: "5.9.3" },
    },
    process.cwd(),
  );

  expect(checks.find((check) => check.name === "relkit-packages")?.ok).toBe(true);
});

test("local add installs workspace integration exports for a full service bundle", async () => {
  const parent = await mkdtemp(join(tmpdir(), "relkit-local-full-"));
  roots.push(parent);
  const project = join(parent, "app");
  await generateProject(
    normalizeCreateOptions(["app", "--directory", project, "--no-install", "--no-git"]),
    { commandRunner: async () => ({ exitCode: 0 }) },
  );
  const executable = join(import.meta.dir, "../../packages/cli/src/local.ts");
  const child = Bun.spawn(
    [process.execPath, executable, "--json", "add", "service", "orders", "--full"],
    {
      cwd: project,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(stderr).toBe("");
  const output = JSON.parse(stdout);
  expect(output).toMatchObject({ ok: true, verification: { status: "passed" } });
  expect(code).toBe(0);
  const manifest = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
  expect(manifest.dependencies["@relkit/local"]).toBe("link:@relkit/local");
  expect(manifest.dependencies["@relkit/ai-sdk"]).toBe("link:@relkit/ai-sdk");
  expect(output.warnings).toContainEqual(expect.objectContaining({ code: "docker-required" }));
}, 60_000);

test("local launcher exposes the shared add API for events and routes", async () => {
  const external = await mkdtemp(join(tmpdir(), "relkit-local-add-"));
  roots.push(external);
  const executable = join(import.meta.dir, "../../packages/cli/src/local.ts");
  for (const kind of ["event", "route"]) {
    const child = Bun.spawn([process.execPath, executable, "--json", "add", kind], {
      cwd: external,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(stderr).toBe("");
    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({
      ok: false,
      error: { code: "RELKIT_ADD_INVALID_PROJECT" },
    });
  }
});

test("local launcher and linked CLI hide workspace build output", async () => {
  const repository = join(import.meta.dir, "../..");
  const external = await mkdtemp(join(tmpdir(), "relkit-linked-cli-"));
  roots.push(external);
  for (const [executable, cwd] of [
    [join(repository, "scripts/relkit-local.ts"), repository],
    [join(repository, "packages/cli/dist/index.js"), external],
  ]) {
    const child = Bun.spawn([process.execPath, executable, "--version"], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(`relkit ${appManifest.version}`);
    expect(`${stdout}\n${stderr}`).not.toContain("turbo");
    expect(`${stdout}\n${stderr}`).not.toContain("Workspace build passed");
  }
}, 20_000);
