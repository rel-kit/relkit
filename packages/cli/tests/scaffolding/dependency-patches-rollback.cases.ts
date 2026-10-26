/** Exercises rollback behavior for portable Drizzle repair, using owned temporary projects and awaited installer cleanup. */
import { expect } from "bun:test";

import { chmod, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ADD_FAILURE_CODES } from "create-relkit/internal/add-types";
import { applyScaffoldPlan } from "../../src/scaffolding/add-transaction.js";
import {
  prepareProjectDependencyPatch,
  readDrizzlePatch,
} from "create-relkit/internal/dependency-patches";
import { patchBuilder, withProject } from "./dependency-patches.fixture.js";

/** Verifies that asset-only repair snapshots a lock created during the failed installation.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function caseAssetOnlyRepairSnapshotsALockCreated() {
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
}

/** Verifies that rolls back manifest, text and binary locks, assets, and modes after patch-only failure.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function caseRollsBackManifestTextAndBinaryLocks() {
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
}

/** Verifies that no-install patch-only plans defer checks until Bun applies the repair.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function caseNoInstallPatchOnlyPlansDeferChecks() {
  await withProject(async (root) => {
    const result = await applyScaffoldPlan(await patchBuilder(root, false).finish(), {
      commandRunner: async () => {
        throw new Error("no-install must not execute a command");
      },
    });
    expect(result.verification).toMatchObject({ status: "skipped" });
    expect(result.nextSteps).toEqual(["bun install", "bun run check"]);
  });
}

/** Verifies that cancellation during patch-only installation restores the lock and patch ownership.
 * @returns Completion after fixture assertions and owned cleanup settle.
 */
export async function caseCancellationDuringPatchOnlyInstallationRestoresThe() {
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
}
