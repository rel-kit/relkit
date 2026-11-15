/**
 * Process helpers of the Node creation smoke: commands that run to completion or stay running,
 * both with their output echoed and captured so a failed step can show what the command printed.
 * Bundled into `smoke.mjs`, so it uses only Node APIs.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createConnection, createServer } from "node:net";

/** How a command ended and everything it printed. */
export interface Finished {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly output: string;
}

/** A command that keeps running in its own process group. */
export interface Running {
  readonly child: ChildProcess;
  readonly command: string;
  /** @returns Everything printed so far. */
  readonly output: () => string;
  readonly finished: Promise<Finished>;
}

/** Reads one `--name value` option. @param name - Option name. @returns Its value. */
export function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

/** @param name - Flag name. @returns Whether `--name` was passed. */
export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * Starts a command with echoed, captured output.
 * @param command - Executable and arguments.
 * @param cwd - Working directory.
 * @param env - Complete environment.
 * @param detached - Whether it leads its own process group, which `stop` signals as a whole.
 * @returns The running command.
 */
export function start(
  command: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  detached = false,
): Running {
  const child = spawn(command[0]!, command.slice(1), {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached,
  });
  let output = "";
  const collect = (target: NodeJS.WriteStream) => (chunk: Buffer) => {
    output += chunk.toString("utf8");
    target.write(chunk);
  };
  child.stdout!.on("data", collect(process.stdout));
  child.stderr!.on("data", collect(process.stderr));
  const finished = new Promise<Finished>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, output }));
  });
  return { child, command: command.join(" "), output: () => output, finished };
}

/**
 * Runs a command to completion.
 * @param command - Executable and arguments.
 * @param cwd - Working directory.
 * @param env - Complete environment.
 * @param timeoutMs - Limit before the whole group is killed.
 * @returns How it ended; a non-zero exit is a result, not an error.
 */
export async function runCaptured(
  command: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs = 900_000,
): Promise<Finished> {
  console.log(`$ ${command.join(" ")}`);
  const running = start(command, cwd, env, true);
  const timer = setTimeout(() => signalGroup(running, "SIGKILL"), timeoutMs);
  try {
    return await running.finished;
  } finally {
    clearTimeout(timer);
  }
}

/** @param running - Group leader. @param signal - Signal sent to every process of the group. */
function signalGroup(running: Running, signal: NodeJS.Signals): void {
  if (running.child.pid === undefined) return;
  try {
    process.kill(-running.child.pid, signal);
  } catch {
    // The group is already gone.
  }
}

/**
 * Sends a signal to the whole group, as Ctrl+C in a terminal does, and waits for the exit.
 * @param running - A command started detached.
 * @param signal - Signal to send.
 * @param graceMs - Wait before the group is killed instead.
 * @returns How it ended.
 */
export async function stop(
  running: Running,
  signal: NodeJS.Signals = "SIGINT",
  graceMs = 30_000,
): Promise<Finished> {
  if (running.child.exitCode === null && running.child.signalCode === null)
    signalGroup(running, signal);
  const timer = setTimeout(() => signalGroup(running, "SIGKILL"), graceMs);
  try {
    return await running.finished;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Waits until a running command has printed text matching a pattern.
 * @param running - The command.
 * @param pattern - Text to wait for.
 * @param timeoutMs - Limit.
 * @returns Resolves once printed; rejects when the command exits or the limit passes first.
 */
export async function waitForOutput(
  running: Running,
  pattern: RegExp,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pattern.test(running.output())) return;
    if (running.child.exitCode !== null || running.child.signalCode !== null)
      throw new Error(`\`${running.command}\` exited before printing ${pattern}.`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`\`${running.command}\` did not print ${pattern} within ${timeoutMs / 1000}s.`);
}

/** @returns A loopback port no listener holds right now. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(typeof address === "object" && address ? address.port : 0));
    });
  });
}

/** @param port - Loopback port. @returns Whether something accepts connections on it. */
export function isListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

/**
 * Fetches one URL until it answers 200.
 * @param url - Address to request.
 * @param running - Command that serves it; its exit ends the wait.
 * @param timeoutMs - Limit.
 * @returns The response text.
 */
export async function waitForOk(url: string, running: Running, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (running.child.exitCode !== null)
      throw new Error(`\`${running.command}\` exited with ${running.child.exitCode}.`);
    const text = await fetch(url).then(
      (response) => (response.status === 200 ? response.text() : undefined),
      () => undefined,
    );
    if (text !== undefined) return text;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} did not answer 200 within ${timeoutMs / 1000}s.`);
}
