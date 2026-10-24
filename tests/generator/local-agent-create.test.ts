/** Validates both original native starter cohorts, project-local additions and retained native SDK identities. */
import { afterEach, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { prepareWorkspaceLinks, useWorkspaceDependencies } from "../../packages/cli/src/local.js";
import { generateProject, normalizeCreateOptions } from "../../packages/create-relkit/src/index.js";
import { renderFrontend, serveApiWhileFrontendIsDelayed } from "./local-agent-runtime.fixture.js";
const roots: string[] = [];
const successful = new Set<string>();

const repository = join(import.meta.dir, "../..");

const executable = join(repository, "packages/cli/src/local.ts");

afterEach(async () => {
  for (const root of roots.splice(0)) {
    if (successful.delete(root)) await rm(root, { recursive: true, force: true });
    else console.error(`Failed local starter fixture retained: ${root}`);
  }
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
    const project = await createStarterProject(template);
    await useWorkspaceDependencies(project);
    expect(await prepareWorkspaceLinks(project)).toMatchObject({ exitCode: 0 });
    await run(["install"], project);
    await run([executable, "check", "--project-root", project], project);
    for (const dependency of [
      "langchain",
      "@langchain/core",
      "@langchain/langgraph",
      "langsmith",
    ]) {
      expect(await realpath(join(project, "node_modules", dependency))).toBe(
        await realpath(
          join(repository, "integrations/packages/langchain/node_modules", dependency),
        ),
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
    successful.add(dirname(project));
  }, 120_000);
}

async function createStarterProject(template: string) {
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
  return project;
}
