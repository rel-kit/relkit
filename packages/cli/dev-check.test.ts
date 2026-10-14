/** Exercises actual isolated compiler diagnostics, process-group disposal and CPU-bound cancellation through native Bun callbacks borrowing scope-owned Effect fixtures. */
import { expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withTemporary } from "../../tests/phase0-harness.js";
import { checkDevProject } from "./src/commands/dev-check.js";
import { configurationSource, running, waitForPids, waitForStopped } from "./dev-check-fixture.js";

/** Owns the original compiler fixture across its finite native acceptance callback.
 * @param source - Optional exact configuration source; absence retains missing-config diagnostics.
 * @param use - Native callback borrowing the root until compiler/evaluator settlement.
 * @returns Completion after original source writing, assertions and physical root release. */
function withProject(
  source: string | undefined,
  use: (root: string) => Promise<void>,
): Promise<void> {
  return withTemporary("relkit-dev-check-", async (root) => {
    if (source !== undefined) await writeFile(join(root, "relkit.config.ts"), source);
    await use(root);
  });
}

test("isolated development checks retain ordinary diagnostics", async () => {
  await withProject(undefined, async (projectRoot) => {
    const checked = await checkDevProject({ projectRoot, generationId: "missing-config" });
    expect(checked.ok).toBe(false);
    expect(checked.projectRoot).toBe(projectRoot);
    expect(checked.diagnostics.some((item) => item.message.includes("relkit.config.ts"))).toBe(
      true,
    );
  });
});

test("an abruptly exited compiler reports its bounded stderr instead of hanging", async () => {
  await withProject(
    'console.error("compiler fixture failed"); process.exit(7);',
    async (projectRoot) => {
      await expect(checkDevProject({ projectRoot, generationId: "crashed" })).rejects.toThrow(
        "Development compiler exited (7): compiler fixture failed",
      );
    },
  );
});

test.skipIf(process.platform === "win32")(
  "a completed check releases imported timers and owned descendants",
  async () => {
    await withProject(configurationSource(false), async (projectRoot) => {
      const checked = await checkDevProject({ projectRoot, generationId: "completed" });
      expect(checked.ok).toBe(false);
      expect(
        checked.diagnostics.some((item) => item.message.includes("fixture config diagnostic")),
      ).toBe(true);
      const pids = await waitForPids(projectRoot);
      await waitForStopped(pids);
      for (const pid of pids) expect(running(pid)).toBe(false);
    });
  },
);

test.skipIf(process.platform === "win32")(
  "cancellation joins a CPU-bound compiler and terminates its evaluator process group",
  async () => {
    await withProject(configurationSource(true), async (projectRoot) => {
      const controller = new AbortController();
      const interrupted = new Error("generation superseded");
      const checked = checkDevProject(
        { projectRoot, generationId: "cancelled" },
        controller.signal,
      );
      // Observe rejection before cancellation; preserve the exact original Error identity.
      const outcome = checked.then(
        () => undefined,
        (error) => {
          if (!(error instanceof Error)) throw error;
          return error;
        },
      );
      try {
        const pids = await waitForPids(projectRoot);
        expect(pids).toHaveLength(2);
        controller.abort(interrupted);
        expect(await outcome).toBe(interrupted);
        // The compiler is already joined; the bounded probe only permits native OS reaping.
        await waitForStopped(pids);
        for (const pid of pids) expect(running(pid)).toBe(false);
      } finally {
        controller.abort(interrupted);
        await outcome;
      }
    });
  },
);
