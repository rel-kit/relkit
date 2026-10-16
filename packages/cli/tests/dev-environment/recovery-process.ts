/**
 * Owns a real `bun dev` invocation, its output readers and bounded shutdown.
 * Polling checks public HTTP bodies while the unchanged CLI process runs;
 * retained logs explain a failed assertion and supply candidate cleanup evidence.
 */
import { execFileSync } from "node:child_process";

/**
 * Waits for a native promise without retaining a timer after settlement.
 * @typeParam A - Native operation's result.
 * @param work - Already owned native operation.
 * @param milliseconds - Finite deadline in milliseconds.
 * @returns The operation result, rejecting on deadline.
 */
async function deadline<A>(work: Promise<A>, milliseconds: number): Promise<A> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Native dev deadline exceeded")), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Starts one ordinary or prepared executable invocation on fixture-selected ports.
 * @param root - Disposable installed app with its dev script already configured.
 * @param mode - JSON selects ordinary startup; prepared startup requires a valid receipt.
 * @param port - Stable public HTTP port owned by this fixture.
 * @returns Output observations, HTTP probes, and an idempotent joined stop.
 */
export function recoveryProcess(root: string, mode: "ordinary" | "prepared", port: number) {
  const args = [process.execPath, "dev"];
  if (mode === "ordinary") args.push("--json");
  const child = Bun.spawn(args, {
    cwd: root,
    env: { ...process.env, NODE_ENV: "development" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let text = "";
  const readers = Promise.all(
    [child.stdout, child.stderr].map(async (stream) => {
      for await (const bytes of stream) text += new TextDecoder().decode(bytes);
    }),
  );
  void readers.catch(() => undefined);
  const read = async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/recovery`, {
        signal: AbortSignal.timeout(1_000),
      });
      return await response.text();
    } catch {
      return "unavailable";
    }
  };
  const wait = async (label: string, check: () => boolean | Promise<boolean>, timeout = 25_000) => {
    const end = performance.now() + timeout;
    while (performance.now() < end) {
      if (child.exitCode !== null)
        throw new Error(`Dev exited (${child.exitCode}): ${text.slice(-4000)}`);
      if (await check()) return;
      await Bun.sleep(250);
    }
    throw new Error(`${label}: ${text.slice(-4000)}`);
  };
  let stopping: Promise<void> | undefined;
  const stop = () => (stopping ??= stopProcess(child, readers, read));
  return { child, logs: () => text, read, wait, stop };
}

/** Joins the owned CLI and both output readers, then verifies listener release. */
async function stopProcess(
  child: Bun.Subprocess<"ignore", "pipe", "pipe">,
  readers: Promise<void[]>,
  read: () => Promise<string>,
) {
  const descendants = ownedDescendants(child.pid);
  if (child.exitCode === null) child.kill("SIGTERM");
  try {
    await deadline(child.exited, 5_000);
  } catch {
    if (child.exitCode === null) child.kill("SIGKILL");
    await child.exited;
  }
  await deadline(readers, 5_000);
  if ((await read()) !== "unavailable") throw new Error("Owned dev listener survived shutdown");
  for (const pid of descendants) {
    try {
      process.kill(pid, 0);
    } catch (cause) {
      if (cause instanceof Error && "code" in cause && cause.code === "ESRCH") continue;
      throw cause;
    }
    throw new Error(`Owned dev descendant ${pid} survived joined shutdown`);
  }
  console.log(`shutdown: ${descendants.length} owned descendants exited; listener unavailable`);
}

/** Captures only descendants of this fixture's executable, including its inspector. */
function ownedDescendants(root: number): readonly number[] {
  const rows = execFileSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf8", timeout: 1_000 })
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
  const owned = new Set([root]);
  let count = 0;
  while (count !== owned.size) {
    count = owned.size;
    for (const [pid, parent] of rows)
      if (pid !== undefined && parent !== undefined && owned.has(parent)) owned.add(pid);
  }
  owned.delete(root);
  return [...owned];
}

export type { RecoveryProcess } from "./recovery.types.js";
