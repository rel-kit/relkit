/**
 * Measures the peak resident memory of a command and every process it starts. A sampler
 * reads `ps` every 20 ms and sums the resident set of the process tree rooted at the
 * command, so a CLI that forks compiler or evaluator children is charged for all of them.
 * The command runs to completion; its exit code is returned rather than thrown, because
 * the benchmark records memory even for a check that reports diagnostics.
 */
import type { MemoryMeasurement } from "./benchmark.types.js";

/** Milliseconds between process-table samples. */
const SAMPLE_INTERVAL_MS = 20;

/**
 * Runs one command and samples its process tree until it exits.
 * @param command - Executable and arguments.
 * @param cwd - Working directory.
 * @param environment - Complete child environment.
 * @returns Peak summed resident bytes, wall duration and exit code.
 */
export async function measurePeakMemory(
  command: readonly string[],
  cwd: string,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<MemoryMeasurement> {
  const startedAt = performance.now();
  const child = Bun.spawn([...command], {
    cwd,
    env: environment,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
  });
  let peakBytes = 0;
  let running = true;
  const sampler = (async () => {
    while (running) {
      peakBytes = Math.max(peakBytes, treeResidentBytes(child.pid));
      await Bun.sleep(SAMPLE_INTERVAL_MS);
    }
  })();
  const exitCode = await child.exited;
  running = false;
  await sampler;
  const stderr = await new Response(child.stderr).text();
  if (exitCode !== 0 && process.env.RELKIT_BENCHMARK_VERBOSE === "1")
    console.error(`${command.join(" ")} exited ${exitCode}: ${stderr.slice(-2_000)}`);
  return { peakBytes, durationMs: performance.now() - startedAt, exitCode };
}

/**
 * Sums the resident set of a process and its descendants.
 * @param root - Root process ID.
 * @returns Bytes; zero once the root has exited.
 */
export function treeResidentBytes(root: number): number {
  const table = Bun.spawnSync(["ps", "-A", "-o", "pid=,ppid=,rss="]).stdout.toString();
  const children = new Map<number, number[]>();
  const resident = new Map<number, number>();
  for (const line of table.split("\n")) {
    const [pid, ppid, rss] = line.trim().split(/\s+/u).map(Number);
    if (pid === undefined || ppid === undefined || rss === undefined || Number.isNaN(rss)) continue;
    resident.set(pid, rss * 1_024);
    children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  }
  let total = 0;
  const pending = [root];
  const seen = new Set<number>();
  while (pending.length > 0) {
    const pid = pending.pop()!;
    if (seen.has(pid)) continue;
    seen.add(pid);
    total += resident.get(pid) ?? 0;
    pending.push(...(children.get(pid) ?? []));
  }
  return total;
}
