/** Runs the actual launcher in projects without an installed CLI and checks its coded guidance. */
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import manifest from "../../package.json" with { type: "json" };

const launcher = resolve(import.meta.dir, "../../src/launcher/bin.ts");

/** The managers a project can declare, with the commands the launcher names for each. */
const MANAGERS = [
  { name: "bun", field: "bun@1.3.10", install: "bun install", addDev: "bun add -d" },
  { name: "npm", field: "npm@11.19.1", install: "npm install", addDev: "npm install -D" },
  { name: "pnpm", field: "pnpm@11.1.0", install: "pnpm install", addDev: "pnpm add -D" },
] as const;

/**
 * Runs the launcher in a project and returns what it printed.
 * @param files - Files of the project, by name.
 * @returns Exit code, standard output and standard error.
 */
async function launch(files: Readonly<Record<string, string>>) {
  const root = await mkdtemp(join(tmpdir(), "relkit-launcher-missing-cli-"));
  try {
    const project = join(root, "app");
    await mkdir(project);
    for (const [name, content] of Object.entries(files))
      await writeFile(join(project, name), content);
    const result = Bun.spawnSync([process.execPath, launcher, "dev"], {
      cwd: project,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    });
    return {
      exitCode: result.exitCode,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

for (const { name, field, install, addDev } of MANAGERS)
  for (const [state, devDependencies, expected] of [
    ["undeclared", {}, `${addDev} @relkit/cli@${manifest.version}`],
    ["declared but not installed", { "@relkit/cli": manifest.version }, `Run \`${install}\`.`],
  ] as const)
    test(`a ${name} project whose CLI is ${state} gets a coded install step`, async () => {
      const result = await launch({
        "package.json": JSON.stringify({ packageManager: field, devDependencies }),
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toStartWith("RELKIT_PROJECT_CLI_REQUIRED: ");
      expect(result.stderr).toContain("@relkit/cli");
      expect(result.stderr).toContain(expected);
      expect(result.stderr).toContain(
        "  next: Add `@relkit/cli` to the project's development dependencies, then run the command again.",
      );
      expect(result.stderr).toContain(
        "  docs: https://relkit.dev/docs/errors/relkit-project-cli-required",
      );
      if (name !== "bun") expect(result.stderr).not.toMatch(/\bbun\b/);
      expect(result.stdout).toBe("");
    });

test("a project without a packageManager field is named by its lockfile", async () => {
  const result = await launch({
    "package.json": JSON.stringify({ devDependencies: { "@relkit/cli": manifest.version } }),
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
  });
  expect(result.stderr).toContain("is not installed. Run `pnpm install`.");
  expect(result.stderr).not.toMatch(/\bbun\b/);
});
