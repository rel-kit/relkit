import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ADD_FAILURE_CODES } from "../src/add-types.js";
import { applyScaffoldPlan } from "../src/add-transaction.js";
import {
  planDependencyPatch,
  prepareProjectDependencyPatch,
  readDrizzlePatch,
} from "../src/dependency-patches.js";
import { patchBuilder, withProject } from "./dependency-patches.fixture.js";
import { SCAFFOLD_DEPENDENCIES } from "../src/scaffold-catalog.js";

describe("portable dependency patches", () => {
  test("uses the central version and byte-identical canonical patch asset", async () => {
    const patch = await readDrizzlePatch();
    const canonical = await readFile(
      resolve(import.meta.dir, "../../../patches/drizzle-orm.patch"),
    );
    expect(Buffer.from(patch.content)).toEqual(canonical);
    expect(patch.hash).toBe(createHash("sha256").update(canonical).digest("hex"));
    expect(patch.key).toBe(`drizzle-orm@${patch.version}`);
    expect(patch.path).toBe(`patches/${patch.key}.patch`);
  });

  test("reuses identical assets and preserves unrelated patch entries and file modes", async () => {
    await withProject(
      async (root) => {
        const patch = await readDrizzlePatch();
        await prepareProjectDependencyPatch(root);
        await chmod(join(root, patch.path), 0o640);
        const source = await readFile(join(root, "package.json"), "utf8");
        expect(JSON.parse(source).patchedDependencies).toEqual({
          "another-package@1.0.0": "patches/another.patch",
          [patch.key]: patch.path,
        });
        expect(await planDependencyPatch(root, source, patch)).toEqual({ content: source });
        expect((await stat(join(root, patch.path))).mode & 0o777).toBe(0o640);
      },
      { patchedDependencies: { "another-package@1.0.0": "patches/another.patch" } },
    );
  });

  test("rejects a conflicting entry or asset before changing the manifest", async () => {
    const patch = await readDrizzlePatch();
    for (const conflict of ["entry", "asset"] as const) {
      await withProject(async (root) => {
        if (conflict === "entry") {
          const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
          manifest.patchedDependencies = { [patch.key]: "patches/user-owned.patch" };
          await writeFile(join(root, "package.json"), JSON.stringify(manifest));
        } else {
          await mkdir(join(root, "patches"));
          await writeFile(join(root, patch.path), "user-owned repair\n");
        }
        const before = await readFile(join(root, "package.json"));
        await expect(patchBuilder(root).finish()).rejects.toMatchObject({
          code: ADD_FAILURE_CODES.collision,
        });
        expect(await readFile(join(root, "package.json"))).toEqual(before);
        if (conflict === "asset") {
          expect(await readFile(join(root, patch.path), "utf8")).toBe("user-owned repair\n");
        } else {
          expect(await Bun.file(join(root, patch.path)).exists()).toBe(false);
        }
      });
    }
  });

  test("rejects symlinked patch directories instead of reusing external assets", async () => {
    await withProject(async (root) => {
      const patch = await readDrizzlePatch();
      const outside = join(root, "outside");
      await mkdir(outside);
      await writeFile(join(outside, `${patch.key}.patch`), patch.content);
      await symlink(outside, join(root, "patches"));
      await expect(patchBuilder(root).finish()).rejects.toMatchObject({
        code: ADD_FAILURE_CODES.collision,
      });
    });
  });

  test("patch-only plans install, retain public package results, and can be finished twice", async () => {
    await withProject(async (root) => {
      const builder = patchBuilder(root);
      const plan = await builder.finish();
      expect(plan.dependencies).toEqual({});
      expect(await builder.finish()).toEqual(plan);
      const commands: string[] = [];
      const result = await applyScaffoldPlan(plan, {
        relkitExecutable: "relkit",
        commandRunner: async (command) => {
          commands.push(command[1] ?? "");
          return { exitCode: 0 };
        },
      });
      expect(commands).toEqual(["install", "check"]);
      expect(result.installedPackages).toEqual([]);
      expect(result.verification.status).toBe("passed");
    });
  });

  test("repairs an existing testing dependency without introducing direct Drizzle", async () => {
    await withProject(
      async (root) => {
        const plan = await patchBuilder(root, true, []).finish();
        expect(plan.dependencies).toEqual({});
        const result = await applyScaffoldPlan(plan, {
          relkitExecutable: "relkit",
          commandRunner: async () => ({ exitCode: 0 }),
        });
        const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
        expect(manifest.dependencies).not.toHaveProperty("drizzle-orm");
        const patch = await readDrizzlePatch();
        expect(manifest.patchedDependencies[patch.key]).toBe(patch.path);
        expect(result.installedPackages).toEqual([]);
      },
      { dependencies: { "@relkit/testing": SCAFFOLD_DEPENDENCIES["@relkit/drizzle"].version } },
    );
  });

  test("adding Effect MQ delivers its transitive Drizzle repair and reports only the new provider", async () => {
    await withProject(
      async (root) => {
        const plan = await patchBuilder(root, true, ["@relkit/effect-mq"]).finish();
        expect(plan.dependencies).toEqual({
          "@relkit/effect-mq": SCAFFOLD_DEPENDENCIES["@relkit/effect-mq"].version,
        });
        const result = await applyScaffoldPlan(plan, {
          relkitExecutable: "relkit",
          commandRunner: async () => ({ exitCode: 0 }),
        });
        const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
        expect(manifest.dependencies).not.toHaveProperty("drizzle-orm");
        const patch = await readDrizzlePatch();
        expect(manifest.patchedDependencies[patch.key]).toBe(patch.path);
        expect(result.installedPackages).toEqual(["@relkit/effect-mq"]);
      },
      { dependencies: {} },
    );
  });

  test("manifest-only patch registration also installs an already delivered asset", async () => {
    await withProject(async (root) => {
      const patch = await readDrizzlePatch();
      await mkdir(join(root, "patches"));
      await writeFile(join(root, patch.path), patch.content);
      const plan = await patchBuilder(root).finish();
      expect(plan.operations.map((operation) => operation.path)).toEqual(["package.json"]);
      const commands: string[] = [];
      await applyScaffoldPlan(plan, {
        relkitExecutable: "relkit",
        commandRunner: async (command) => {
          commands.push(command[1] ?? "");
          return { exitCode: 0 };
        },
      });
      expect(commands).toEqual(["install", "check"]);
    });
  });

  test("asset-only repair snapshots a lock created during the failed installation", async () => {
    await withProject(async (root) => {
      await prepareProjectDependencyPatch(root);
      const before = await readFile(join(root, "package.json"));
      const patch = await readDrizzlePatch();
      await rm(join(root, patch.path));
      const plan = await patchBuilder(root).finish();
      expect(plan.operations.map((operation) => operation.path)).toEqual([patch.path]);
      await expect(
        applyScaffoldPlan(plan, {
          commandRunner: async () => {
            await writeFile(join(root, "bun.lock"), "new lock\n");
            return { exitCode: 1, stderr: "failed to install repair" };
          },
        }),
      ).rejects.toMatchObject({ code: ADD_FAILURE_CODES.installation });
      expect(await readFile(join(root, "package.json"))).toEqual(before);
      await expect(stat(join(root, "bun.lock"))).rejects.toMatchObject({ code: "ENOENT" });
      await expect(stat(join(root, patch.path))).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  test("rolls back manifest, text and binary locks, assets, and modes after patch-only failure", async () => {
    await withProject(async (root) => {
      const before = await readFile(join(root, "package.json"));
      await chmod(join(root, "package.json"), 0o640);
      await writeFile(join(root, "bun.lock"), "original text lock\n");
      await writeFile(join(root, "bun.lockb"), new Uint8Array([0, 1, 254, 255]));
      await chmod(join(root, "bun.lockb"), 0o600);
      await writeFile(join(root, "dirty.txt"), "user-owned\n");
      const patch = await readDrizzlePatch();
      await expect(
        applyScaffoldPlan(await patchBuilder(root).finish(), {
          commandRunner: async () => {
            await writeFile(join(root, "bun.lock"), "changed\n");
            await writeFile(join(root, "bun.lockb"), new Uint8Array([20]));
            return { exitCode: 1, stderr: "patch installation failed" };
          },
        }),
      ).rejects.toMatchObject({ code: ADD_FAILURE_CODES.installation });
      expect(await readFile(join(root, "package.json"))).toEqual(before);
      expect((await stat(join(root, "package.json"))).mode & 0o777).toBe(0o640);
      expect(await readFile(join(root, "bun.lock"), "utf8")).toBe("original text lock\n");
      expect(await readFile(join(root, "bun.lockb"))).toEqual(Buffer.from([0, 1, 254, 255]));
      expect((await stat(join(root, "bun.lockb"))).mode & 0o777).toBe(0o600);
      expect(await Bun.file(join(root, patch.path)).exists()).toBe(false);
      await expect(stat(join(root, "patches"))).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readFile(join(root, "dirty.txt"), "utf8")).toBe("user-owned\n");
    });
  });

  test("no-install patch-only plans defer checks until Bun applies the repair", async () => {
    await withProject(async (root) => {
      const result = await applyScaffoldPlan(await patchBuilder(root, false).finish(), {
        commandRunner: async () => {
          throw new Error("no-install must not execute a command");
        },
      });
      expect(result.verification).toMatchObject({ status: "skipped" });
      expect(result.nextSteps).toEqual(["bun install", "bun run check"]);
    });
  });

  test("cancellation during patch-only installation restores the lock and patch ownership", async () => {
    await withProject(async (root) => {
      const before = await readFile(join(root, "package.json"));
      await writeFile(join(root, "bun.lock"), "original lock\n");
      const controller = new AbortController();
      const patch = await readDrizzlePatch();
      await expect(
        applyScaffoldPlan(await patchBuilder(root).finish(), {
          signal: controller.signal,
          commandRunner: async () => {
            await writeFile(join(root, "bun.lock"), "interrupted lock\n");
            controller.abort();
            return { exitCode: 0 };
          },
        }),
      ).rejects.toMatchObject({ code: ADD_FAILURE_CODES.cancellation, exitCode: 130 });
      expect(await readFile(join(root, "package.json"))).toEqual(before);
      expect(await readFile(join(root, "bun.lock"), "utf8")).toBe("original lock\n");
      await expect(stat(join(root, patch.path))).rejects.toMatchObject({ code: "ENOENT" });
    });
  });
});
