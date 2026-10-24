/** Gives native Playwright first ownership of SIGINT teardown, then joins only
 * the exact exec-preserved webServer groups recorded in this invocation's root.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { signalScaffoldGroup } from "./scaffold-process.js";
import type { ScaffoldChild } from "./scaffold-process.types.js";

/** Joins native browser/server teardown before any selected cache is removed.
 * @param owner - Existing scoped native Playwright process authority.
 * @param artifacts - Unique directory containing only this run's server IDs.
 * @returns After native cleanup or exact owned-group fallback joins.
 */
export async function closePlaywright(owner: ScaffoldChild, artifacts: string): Promise<void> {
  if (owner.process.exitCode === null) {
    try {
      process.kill(-owner.process.pid, "SIGINT");
    } catch (cause) {
      if (!(cause instanceof Error) || !("code" in cause) || cause.code !== "ESRCH") throw cause;
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      owner.settled,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    const results = await Promise.allSettled([
      owner.release(),
      closeServerGroup(artifacts, "frontend"),
      closeServerGroup(artifacts, "backend"),
    ]);
    process.stdout.write(owner.output());
    const failures = results.flatMap((result) =>
      result.status === "rejected"
        ? [new Error("Playwright owned cleanup failed", { cause: result.reason })]
        : [],
    );
    if (failures.length) throw new AggregateError(failures, "Playwright cleanup failed");
  }
}

/** Reads only an invocation-owned native shell PID, preserved by exec. */
async function closeServerGroup(artifacts: string, name: "backend" | "frontend"): Promise<void> {
  const text = await readFile(join(artifacts, `${name}.pid`), "utf8").catch((cause) => {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return undefined;
    throw cause;
  });
  if (text === undefined) return;
  if (!/^[1-9]\d*$/.test(text)) throw new Error(`Invalid owned Playwright ${name} group`);
  const pid = Number(text);
  if (!groupExists(pid)) return;
  signalScaffoldGroup(pid, "SIGTERM");
  if (await waitForGroup(pid)) return;
  signalScaffoldGroup(pid, "SIGKILL");
  if (!(await waitForGroup(pid)))
    throw new Error(`Owned Playwright ${name} group ${pid} did not exit`);
}

/** Bounds fallback polling without signalling another invocation's listeners. */
async function waitForGroup(pid: number): Promise<boolean> {
  const deadline = Date.now() + 2000;
  while (groupExists(pid) && Date.now() < deadline) await Bun.sleep(25);
  return !groupExists(pid);
}

/** Distinguishes native missing-group success from a real permission failure. */
function groupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ESRCH") return false;
    throw cause;
  }
}
