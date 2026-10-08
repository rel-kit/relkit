import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readDrizzlePatch } from "../src/dependency-patches.js";
import { generateProject } from "../src/generate.js";
import { normalizeCreateOptions } from "../src/options.js";

const templateRoot = resolve(import.meta.dir, "../../../templates/default/v1");

test("every starter owns the canonical declaration repair before its first installation", async () => {
  const parent = await mkdtemp(join(tmpdir(), "relkit-patch-generation-"));
  try {
    const patch = await readDrizzlePatch();
    for (const template of ["minimal", "api", "agent", "fullstack"] as const) {
      const commands: string[] = [];
      const result = await generateProject(
        normalizeCreateOptions([template, "--template", template, "--no-git"]),
        {
          cwd: parent,
          templateRoot,
          relkitExecutable: "relkit",
          commandRunner: async (command, cwd) => {
            commands.push(command[1] ?? "");
            if (command[1] === "install") {
              expect(await readFile(join(cwd, patch.path), "utf8")).toBe(patch.content);
              const manifest = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
              expect(manifest.patchedDependencies[patch.key]).toBe(patch.path);
              expect(Object.values(manifest.dependencies)).not.toContain("catalog:");
            }
            return { exitCode: 0 };
          },
        },
      );
      expect(commands).toEqual(["install", "doctor", "check"]);
      expect(result.files).toContain(patch.path);
      expect(await readFile(join(result.destination, patch.path), "utf8")).toBe(patch.content);
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("no-install creation still publishes the portable asset and declaration", async () => {
  const parent = await mkdtemp(join(tmpdir(), "relkit-patch-no-install-"));
  try {
    const patch = await readDrizzlePatch();
    const result = await generateProject(
      normalizeCreateOptions(["example", "--no-install", "--no-git"]),
      {
        cwd: parent,
        templateRoot,
        commandRunner: async () => {
          throw new Error("no-install must not execute commands");
        },
      },
    );
    const manifest = JSON.parse(await readFile(join(result.destination, "package.json"), "utf8"));
    expect(manifest.patchedDependencies[patch.key]).toBe(patch.path);
    expect(result.installed).toBe(false);
    expect(result.files).toContain(patch.path);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
