/**
 * Releasing the type-check watch stops the checker's whole process tree. A checker that is a
 * JavaScript launcher in front of a native child (`typescript` 7's `tsc`, `tsgo`) must not leave
 * the child running with the output pipe open: the release settles within a bound, neither the
 * launcher nor its child is alive afterwards, and the process that held the watch can exit. The
 * script runs on each runtime the CLI supports; the launcher's child either exits on `SIGTERM`
 * or ignores it, which the release escalates past.
 */
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";

const RUNNER = fileURLToPath(new URL("./fixtures/typecheck-watch-release.mjs", import.meta.url));

/**
 * Checks whether a process exists.
 * @param pid - Process ID.
 * @returns Whether a signal 0 reaches it.
 */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Waits for a process to be gone; the kernel may need a moment to reap a killed process.
 * @param pid - Process ID.
 * @returns Whether it is gone.
 */
async function gone(pid: number): Promise<boolean> {
  const deadline = Date.now() + 500;
  while (alive(pid) && Date.now() < deadline) await Bun.sleep(20);
  return !alive(pid);
}

for (const host of ["bun", "node"] as const)
  for (const mode of ["plain", "stubborn"] as const)
    test(
      `${host}: releasing the watch stops a launcher and its ${mode} child`,
      async () => {
        const run = Bun.spawn([host, RUNNER, mode], { stdout: "pipe", stderr: "pipe" });
        const exited = await Promise.race([run.exited, Bun.sleep(20_000).then(() => "hung")]);
        if (exited === "hung") run.kill("SIGKILL");
        const text = await new Response(run.stdout).text();
        const report = JSON.parse(text.trim().split("\n").at(-1) ?? "{}") as {
          releaseMs: number;
          launcher: number;
          child: number;
        };
        const survivors = [report.launcher, report.child].filter((pid) => alive(pid));
        for (const pid of survivors) process.kill(pid, "SIGKILL");
        expect({ exited, survivors, within: report.releaseMs <= 2_000 }).toEqual({
          exited: 0,
          survivors: [],
          within: true,
        });
        expect(await gone(report.launcher)).toBe(true);
        expect(await gone(report.child)).toBe(true);
      },
      { timeout: 40_000 },
    );
