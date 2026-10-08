import { expect, test } from "bun:test";
import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveInspectorInstallation } from "../../src/commands/dev-inspector.js";

test("inspector overrides reject a package manifest that escapes the selected directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "relkit-inspector-installation-"));
  try {
    const root = join(directory, "inspector");
    await mkdir(root);
    const external = join(directory, "external-package.json");
    await writeFile(external, "{}");
    await symlink(external, join(root, "package.json"));
    expect(() => resolveInspectorInstallation(undefined, { RELKIT_INSPECTOR_ROOT: root })).toThrow(
      "package.json must stay inside the inspector directory",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("source overrides retain different checkouts, relative paths and directory symlinks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "relkit-inspector-installation-"));
  try {
    const root = join(directory, "inspector with spaces");
    await mkdir(root);
    await writeFile(join(root, "package.json"), "{}");
    const alias = join(directory, "inspector-alias");
    await symlink(root, alias);
    for (const path of [root, alias]) {
      expect(resolveInspectorInstallation(undefined, { RELKIT_INSPECTOR_ROOT: path })).toEqual({
        root: await realpath(root),
        command: [process.execPath, "run", "dev"],
      });
    }
    const workspace = fileURLToPath(new URL("../../../../apps/inspector", import.meta.url));
    expect(
      resolveInspectorInstallation(undefined, { RELKIT_INSPECTOR_ROOT: "apps/inspector" }).root,
    ).toBe(await realpath(workspace));
    expect(resolveInspectorInstallation(undefined, {}).root).toBe(await realpath(workspace));
    expect(() =>
      resolveInspectorInstallation(undefined, { RELKIT_INSPECTOR_ROOT: directory }),
    ).toThrow("does not contain an inspector app");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the executable rejects an escaped manifest before starting the initial compiler", async () => {
  const directory = await mkdtemp(
    fileURLToPath(new URL("./.inspector-security-", import.meta.url)),
  );
  try {
    const inspector = join(directory, "inspector");
    await mkdir(inspector);
    const external = join(directory, "external-package.json");
    await writeFile(external, "{}");
    await symlink(external, join(inspector, "package.json"));
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ name: "inspector-security", private: true, type: "module" }),
    );
    await writeFile(
      join(directory, "relkit.config.ts"),
      'if (typeof process.send === "function") await Bun.write(new URL("./compiler-started", import.meta.url), "started"); export default {};',
    );
    const child = Bun.spawn(
      [
        process.execPath,
        fileURLToPath(new URL("../../src/bin.ts", import.meta.url)),
        "dev",
        "--json",
        "--project-root",
        directory,
      ],
      {
        cwd: directory,
        env: { ...process.env, RELKIT_INSPECTOR_ROOT: inspector },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10_000,
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(code, stderr).toBe(1);
    expect(await Bun.file(join(directory, "compiler-started")).exists(), stdout).toBe(false);
    expect(stdout).toContain("package.json must stay inside the inspector directory");
    expect(
      await Bun.file(join(directory, ".relkit/generated/application.graph.json")).exists(),
    ).toBe(false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 15_000);
