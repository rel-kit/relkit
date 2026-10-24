/** Runs the actual wrapper to verify explicit CLI ownership without rewriting arguments or launch cwd. */
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import manifest from "../package.json" with { type: "json" };

const wrapper = resolve(import.meta.dir, "../src/bin.ts");

for (const syntax of ["absolute", "relative", "equals"])
  test(`explicit ${syntax} project root selects its compatible CLI and preserves argv/cwd`, async () => {
    const root = await mkdtemp(join(tmpdir(), "relkit-wrapper-root-"));
    try {
      const application = join(root, "selected application");
      const cwd = join(root, "caller");
      await mkdir(cwd);
      await installedCli(application, "selected");
      if (syntax !== "absolute") await installedCli(cwd, "foreign", "0.0.0");
      const selected = syntax === "relative" ? relative(cwd, application) : application;
      const flag =
        syntax === "equals" ? [`--project-root=${selected}`] : ["--project-root", selected];
      const argv = ["check", ...flag, "--json", "--", "literal operand"];
      const result = Bun.spawnSync([process.execPath, wrapper, ...argv], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 5000,
      });
      expect(result.exitCode, result.stderr.toString()).toBe(0);
      expect(JSON.parse(result.stdout.toString())).toEqual({
        owner: "selected",
        cwd: realpathSync(cwd),
        argv,
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

test("project-root text after -- is an operand and does not select another CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-wrapper-root-"));
  try {
    const cwd = join(root, "caller");
    await installedCli(cwd, "caller");
    const argv = ["check", "--", "--project-root", join(root, "absent")];
    const result = Bun.spawnSync([process.execPath, wrapper, ...argv], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
    expect(JSON.parse(result.stdout.toString())).toEqual({
      owner: "caller",
      cwd: realpathSync(cwd),
      argv,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("create, help and version do not require a compatible caller CLI", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-wrapper-root-"));
  try {
    await installedCli(root, "foreign", "0.0.0");
    for (const argv of [["create", "--help"], ["--help"], ["--version"]]) {
      const result = Bun.spawnSync([process.execPath, wrapper, ...argv], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 5000,
      });
      if (argv[0] === "create") {
        expect(result.exitCode).toBe(2);
        expect(result.stderr.toString()).toContain("RELKIT_CREATE_USAGE");
      } else expect(result.exitCode, result.stderr.toString()).toBe(0);
      expect(result.stdout.toString()).not.toContain('"owner":"foreign"');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/**
 * Installs a tiny native CLI whose output identifies its actual launch context.
 * @param project - Owned fixture project, declared as an explicit CLI consumer.
 * @param owner - Marker emitted by this physical CLI installation.
 * @param version - Compatible version by default, or a deliberately foreign version.
 * @returns Completion after the declared manifest and executable exist.
 */
async function installedCli(
  project: string,
  owner: string,
  version = manifest.version,
): Promise<void> {
  const directory = join(project, "node_modules/@relkit/cli");
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(project, "package.json"),
    JSON.stringify({
      private: true,
      devDependencies: { "@relkit/cli": version },
    }),
  );
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({
      name: "@relkit/cli",
      version,
      type: "module",
      bin: { relkit: "./bin.js" },
    }),
  );
  await writeFile(
    join(directory, "bin.js"),
    `console.log(JSON.stringify({owner:${JSON.stringify(owner)},cwd:process.cwd(),argv:process.argv.slice(2)}));\n`,
  );
}
