/**
 * A long-lived child process that owns descendants of its own, such as the type checker:
 * `typescript` 7's `tsc` is a JavaScript launcher that starts the native compiler and does not
 * forward signals, so stopping only the launcher leaves the native process running with the
 * output pipe open. The child therefore starts as the leader of its own process group, and
 * stopping signals the whole group, escalates to `SIGKILL` after a short grace, and cancels the
 * output reader so a pipe that something else still holds cannot keep this process alive.
 * Windows has no process groups: the child alone is signalled there.
 */
import { runtime } from "../runtime/index.js";
import type { RuntimeSpawnOptions, RuntimeSubprocess } from "relkit/runtime";

/** How long the tree gets to exit after `SIGTERM` before `SIGKILL`. */
const GRACE_MS = 1_000;

/** How long the tree gets to disappear after `SIGKILL`; a process in an uninterruptible state may outlast it. */
const KILL_WAIT_MS = 1_000;

/** How long cancelling the output reader may take. */
const CANCEL_MS = 500;

/** Pause between checks of the process group. */
const POLL_MS = 25;

/** The part of a stream reader the watch uses, which both runtimes' stream types satisfy. */
export interface WatchOutputReader {
  /** @returns The next chunk, or `done` once the stream ended or was cancelled. */
  readonly read: () => Promise<{ readonly done: boolean; readonly value?: Uint8Array | undefined }>;
  /** @returns Completion once the stream is released. */
  readonly cancel: () => Promise<void>;
}

/** A started watch process and the reader of its standard output. */
export interface WatchProcess {
  /** The child, leader of its own process group where the platform has one. */
  readonly child: RuntimeSubprocess;
  /** Reader of the child's standard output; {@link stopWatchProcess} cancels it. */
  readonly reader: WatchOutputReader;
}

/**
 * Starts a command as the leader of its own process group, with standard output piped.
 * @param command - Executable and literal arguments.
 * @param options - Spawn options; the process group and the piped output are set here.
 * @returns The child and the reader of its output.
 */
export function spawnWatchProcess(
  command: readonly string[],
  options: Omit<RuntimeSpawnOptions, "processGroup" | "stdout">,
): WatchProcess {
  const child = runtime.processes.spawn(command, {
    ...options,
    stdout: "pipe",
    processGroup: true,
  });
  return { child, reader: child.stdout.getReader() };
}

/**
 * Stops the child and everything it started, then releases the output reader.
 * @param watch - Process from {@link spawnWatchProcess}.
 * @returns Completion within about three seconds at most; never rejects.
 */
export async function stopWatchProcess(watch: WatchProcess): Promise<void> {
  const { child, reader } = watch;
  signalTree(child, "SIGTERM");
  if (!(await treeGone(child, GRACE_MS))) {
    signalTree(child, "SIGKILL");
    await treeGone(child, KILL_WAIT_MS);
  }
  await within(
    reader.cancel().catch(() => undefined),
    CANCEL_MS,
  );
}

/**
 * Signals the process group, or the child alone where there are no groups.
 * @param child - Group leader.
 * @param signal - Signal to send.
 */
function signalTree(child: RuntimeSubprocess, signal: NodeJS.Signals): void {
  if (process.platform !== "win32")
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // The group is already gone; the child's own kill below is then a no-op.
    }
  try {
    child.kill(signal);
  } catch {
    // Already gone.
  }
}

/**
 * Waits until the child exited and its process group is empty.
 * @param child - Group leader.
 * @param limitMs - Longest wait.
 * @returns Whether the whole tree is gone.
 */
async function treeGone(child: RuntimeSubprocess, limitMs: number): Promise<boolean> {
  const deadline = Date.now() + limitMs;
  await within(child.exited, limitMs);
  if (process.platform === "win32") return child.exitCode !== null || child.signalCode !== null;
  while (groupAlive(child.pid)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  return true;
}

/**
 * Probes a process group.
 * @param pgid - Process group ID, the leader's pid.
 * @returns Whether any process still belongs to it.
 */
function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    // ESRCH: the group is empty. EPERM would mean it is someone else's, which is not ours to wait for.
    return false;
  }
}

/**
 * Waits for a promise for at most a time, leaving no timer behind.
 * @param promise - Promise to wait for; its rejection counts as settled.
 * @param ms - Longest wait.
 * @returns Completion when the promise settled or the time ran out.
 */
async function within(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ms);
  });
  try {
    await Promise.race([promise.catch(() => undefined), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
