/** Runs the actual launcher in projects without an installed CLI and checks its coded guidance. */
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import manifest from "../../package.json" with { type: "json" };

const launcher = resolve(import.meta.dir, "../../src/launcher/bin.ts");

for (const [name, devDependencies, expected] of [
  ["undeclared", {}, `bun add -d @relkit/cli@${manifest.version}`],
  ["declared but not installed", { "@relkit/cli": manifest.version }, "Run `bun install`."],
] as const)
  test(`a project whose CLI is ${name} gets a coded install step`, async () => {
    const root = await mkdtemp(join(tmpdir(), "relkit-launcher-missing-cli-"));
    try {
      const project = join(root, "app");
      await mkdir(project);
      await writeFile(join(project, "package.json"), JSON.stringify({ devDependencies }));
      const result = Bun.spawnSync([process.execPath, launcher, "dev"], {
        cwd: project,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 5000,
      });
      const output = result.stderr.toString();
      expect(result.exitCode).toBe(1);
      expect(output).toStartWith("RELKIT_PROJECT_CLI_REQUIRED: ");
      expect(output).toContain("@relkit/cli");
      expect(output).toContain(expected);
      expect(output).toContain("  next: Run `bun add -d @relkit/cli` in the project");
      expect(output).toContain(
        "  docs: https://relkit.dev/docs/errors/relkit-project-cli-required",
      );
      expect(result.stdout.toString()).toBe("");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
