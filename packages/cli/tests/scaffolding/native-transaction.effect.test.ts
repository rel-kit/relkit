/** Verifies CLI-owned native transaction behavior through retained creator services, preserving typed failures and awaited fixture cleanup. */

import { expect, it } from "@effect/vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { applyScaffoldPlan } from "../../src/scaffolding/add-transaction.js";
import { normalizeAddRequest } from "../../src/scaffolding/add-options.js";
import { AddScaffoldError, type ScaffoldPlan } from "create-relkit/internal/add-types";
import {
  installerServer,
  prepareInstaller,
  nativeRollbackPlan,
  assertNativeRollback,
} from "./native-transaction.fixture.js";

it.live("waits for inherited installer pipes before restoring files and both lock formats", () =>
  Effect.promise(async () => {
    const root = await mkdtemp(join(tmpdir(), "relkit-native-rollback-"));
    const { entered, release, server } = installerServer();
    const controller = new AbortController();
    let pids: { parent: number; descendant: number } | undefined;
    let task: Promise<unknown> | undefined;
    try {
      const installer = await prepareInstaller(root, server.url.href);
      const plan = nativeRollbackPlan(root);
      task = applyScaffoldPlan(plan, {
        signal: controller.signal,
        bunExecutable: installer,
      }).catch((error: unknown) => error);
      pids = await entered.promise;
      controller.abort();
      await waitForExit(pids.parent);
      const completedBeforeDescendant = await Promise.race([
        task.then(() => true),
        Bun.sleep(100).then(() => false),
      ]);
      release.resolve();
      const failure = await task;
      await waitForExit(pids.descendant);
      await assertNativeRollback(root, failure, completedBeforeDescendant);
    } finally {
      controller.abort();
      release.resolve();
      if (pids !== undefined) {
        for (const pid of [pids.parent, pids.descendant]) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {}
        }
      }
      await task;
      server.stop(true);
      await rm(root, { recursive: true, force: true });
    }
  }),
);

/**
 * Waits for a fixture process to release its native handle before checking rollback state.
 * @param pid - Parent or descendant PID reported by the native installer fixture.
 * @returns Completion after exit, or a bounded failure for a leaked process.
 */
async function waitForExit(pid: number): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await Bun.sleep(5);
  }
  throw new Error(`Installer fixture process ${pid} did not exit.`);
}
