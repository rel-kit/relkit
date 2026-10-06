import { afterEach, expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { versionChecks } from "../../packages/cli/src/commands/doctor-compat.js";
import { useWorkspaceDependencies } from "../../packages/cli/src/local.js";
import appManifest from "../../packages/app/package.json" with { type: "json" };
import cliManifest from "../../packages/cli/package.json" with { type: "json" };
import { generateProject, normalizeCreateOptions } from "../../packages/create-relkit/src/index.ts";
import { runScaffoldTerminal } from "../../scripts/scaffold-smoke-terminal.ts";

const roots: string[] = [];

test("local create asks for jobs and final confirmation when other choices are explicit", async () => {
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
    [
      ["Jobs service", "\r"],
      ["Create this project?", "\r"],
    ],
  );
  expect(result.code, result.output).toBe(0);
  expect(result.output).not.toContain("Add an artifact before finishing?");
  expect(result.output).not.toContain("Project name");
  expect(result.output).not.toContain("App format");
  expect(result.output).not.toContain("Starter template");
  expect(result.output).not.toContain("Destination");
  expect(result.output).not.toContain("Initialize a Git repository?");
  expect(result.output).not.toContain("Planned project");
  expect(await Bun.file(join(parent, "app/package.json")).exists()).toBe(true);
}, 600_000);

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("local create preserves unrelated dependency versions when linking RELKIT packages", async () => {
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

test("local create shares matching native dependencies without changing different versions", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-local-native-links-"));
  roots.push(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      dependencies: {
        "@relkit/app": appManifest.version,
        "@langchain/langgraph": "1.4.14",
        langchain: "1.5.10",
        effect: "4.0.0-rc.114",
      },
    }),
  );

  const names = await useWorkspaceDependencies(root);
  expect(names).toContain("@langchain/langgraph");
  expect(names).toContain("langchain");
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  expect(manifest.dependencies).toEqual({
    "@relkit/app": "link:@relkit/app",
    "@langchain/langgraph": "link:@langchain/langgraph",
    langchain: "link:langchain",
    effect: "4.0.0-rc.114",
  });
  expect(await useWorkspaceDependencies(root)).toEqual(names);
});

test("local links keep web dependencies local and repair previously linked inspector packages", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-local-web-dependencies-"));
  roots.push(root);
  for (const linked of [false, true]) {
    if (linked) {
      await mkdir(join(root, "node_modules"), { recursive: true });
      await symlink(
        join(import.meta.dir, "../../packages/cli/node_modules/next"),
        join(root, "node_modules/next"),
      );
    }
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        dependencies: {
          "@relkit/app": appManifest.version,
          langchain: "link:langchain",
          next: linked ? "link:next" : "16.3.3",
          react: linked ? "link:react" : "19.2.8",
          "react-dom": linked ? "link:react-dom" : "19.2.8",
        },
        devDependencies: { "@relkit/cli": appManifest.version },
      }),
    );
    const names = await useWorkspaceDependencies(root);
    const manifest = await Bun.file(join(root, "package.json")).json();
    expect(names).not.toContain("next");
    expect(names).not.toContain("react");
    expect(names).not.toContain("react-dom");
    expect(manifest.dependencies).toMatchObject({
      langchain: "link:langchain",
      next: linked ? cliManifest.relkit.buildCatalog.dependencies.next : "16.3.3",
      react: "19.2.8",
      "react-dom": "19.2.8",
    });
    if (linked) {
      await expect(lstat(join(root, "node_modules/next"))).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(
        await Bun.file(
          join(import.meta.dir, "../../packages/cli/node_modules/next/package.json"),
        ).exists(),
      ).toBe(true);
    }
  }
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
    [join(repository, "packages/cli/dist/bin.js"), external],
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
