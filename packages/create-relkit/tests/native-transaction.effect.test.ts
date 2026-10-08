import { expect, it } from "@effect/vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { applyScaffoldPlan } from "../src/add-transaction.js";
import { normalizeAddRequest } from "../src/add-options.js";
import { AddScaffoldError, type ScaffoldPlan } from "../src/add-types.js";

it.live("waits for inherited installer pipes before restoring files and both lock formats", () =>
  Effect.promise(async () => {
    const root = await mkdtemp(join(tmpdir(), "relkit-native-rollback-"));
    const entered = Promise.withResolvers<{ parent: number; descendant: number }>();
    const release = Promise.withResolvers<void>();
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        const query = new URL(request.url).searchParams;
        entered.resolve({
          parent: Number(query.get("parent")),
          descendant: Number(query.get("child")),
        });
        await release.promise;
        return new Response("continue");
      },
    });
    const controller = new AbortController();
    let pids: { parent: number; descendant: number } | undefined;
    let task: Promise<unknown> | undefined;
    try {
      await Promise.all([
        writeFile(join(root, "value.ts"), "original"),
        writeFile(join(root, "bun.lock"), "lock-original"),
        writeFile(join(root, "bun.lockb"), "binary-original"),
      ]);
      const descendant = [
        `await fetch(${JSON.stringify(server.url.href)} + "?parent=" + process.env.RELKIT_PARENT_PID + "&child=" + process.pid);`,
        'await Bun.write("value.ts", "late-install-write");',
        'await Bun.write("bun.lock", "late-lock-write");',
        'await Bun.write("bun.lockb", "late-binary-write");',
      ].join("\n");
      const installer = join(root, "installer");
      await writeFile(
        installer,
        [
          `#!${process.execPath}`,
          `const child = Bun.spawn([process.execPath, "-e", ${JSON.stringify(descendant)}], {`,
          '  stdout: "inherit", stderr: "inherit",',
          "  env: { ...process.env, RELKIT_PARENT_PID: String(process.pid) },",
          "});",
          "await child.exited;",
        ].join("\n"),
        { mode: 0o755 },
      );
      const plan: ScaffoldPlan = {
        request: {
          ...normalizeAddRequest(["function", "Sample", "--project-root", root]),
          install: true,
        },
        projectRoot: root,
        operations: [{ path: "value.ts", action: "update", content: "updated" }],
        dependencies: { effect: "4.0.1" },
        artifacts: [],
        profiles: [],
        warnings: [],
        nextSteps: [],
      };
      task = applyScaffoldPlan(plan, { signal: controller.signal, bunExecutable: installer }).catch(
        (error: unknown) => error,
      );
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
      const restored = await Promise.all(
        ["value.ts", "bun.lock", "bun.lockb"].map((path) => readFile(join(root, path), "utf8")),
      );
      expect(failure).toBeInstanceOf(AddScaffoldError);
      expect(failure).toMatchObject({ code: "RELKIT_ADD_CANCELLED", exitCode: 130 });
      expect(restored).toEqual(["original", "lock-original", "binary-original"]);
      expect(completedBeforeDescendant).toBe(false);
      expect((await readdir(root)).filter((path) => path.endsWith(".tmp"))).toEqual([]);
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
