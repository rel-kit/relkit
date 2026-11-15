/**
 * Launches the built Inspector tool as a real process with the current runtime and reads what it
 * says about history: its `/storage` status, its request history and its DuckDB worker process.
 * Works under Node and under Bun.
 */
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

/** The status the Inspector's pages read from `/_relkit/v1/storage`. */
export interface StorageStatus {
  readonly state?: string;
  readonly collection?: string;
  readonly error?: string;
  readonly incomplete?: boolean;
  readonly recordsLostBeforeHistory?: Readonly<Record<string, number>>;
}

/** A running Inspector tool. */
export interface ToolProcess {
  readonly pid: number;
  /** Base of the history API, such as `http://127.0.0.1:51234/_relkit/backend/_relkit/v1`. */
  readonly api: string;
  readonly output: () => string;
  readonly close: () => Promise<void>;
}

/** @returns A loopback port nothing listens on. */
export function freePort(): Promise<number> {
  return new Promise<number>((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      server.close(() => done(typeof address === "object" && address ? address.port : 0));
    });
  });
}

/**
 * Starts `packages/inspector/dist/bin.js` for a project.
 * @param projectRoot - Project whose `relkit dev` session the tool attaches to.
 * @returns The process; `close` sends SIGTERM and waits, then SIGKILL after five seconds.
 */
export async function launchTool(projectRoot: string): Promise<ToolProcess> {
  const port = await freePort();
  const bin = resolve(import.meta.dirname, "../../../packages/inspector/dist/bin.js");
  const child = spawn(process.execPath, [bin, "--project-root", projectRoot, "--port", `${port}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let text = "";
  const keep = (chunk: Buffer) => {
    text = `${text}${chunk.toString()}`.slice(-20_000);
  };
  child.stdout.on("data", keep);
  child.stderr.on("data", keep);
  const exited = new Promise<void>((done) => child.once("exit", () => done()));
  const close = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    await exited.finally(() => clearTimeout(timer));
  };
  return {
    pid: child.pid!,
    api: `http://127.0.0.1:${port}/_relkit/backend/_relkit/v1`,
    output: () => text,
    close,
  };
}

/**
 * Polls until a reading satisfies a condition.
 * @param read - Takes one reading; a rejection counts as no reading.
 * @param done - The condition.
 * @param ms - How long to wait.
 * @param what - Names the wait in the failure message.
 * @returns The first reading that satisfies the condition.
 */
export async function until<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  ms: number,
  what: string,
): Promise<T> {
  const deadline = Date.now() + ms;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await read().catch(() => undefined);
    if (last !== undefined && done(last)) return last;
    await sleep(100);
  }
  throw new Error(`${what} did not happen in ${ms} ms; last reading: ${JSON.stringify(last)}`);
}

/** @returns The tool's `/storage` answer. */
export async function storage(tool: ToolProcess): Promise<StorageStatus> {
  return (await fetch(`${tool.api}/storage`)).json() as Promise<StorageStatus>;
}

/** @returns Whether the tool's history holds a request with this ID. */
export async function stored(tool: ToolProcess, requestId: string): Promise<boolean> {
  const response = await fetch(`${tool.api}/requests/${encodeURIComponent(requestId)}`);
  await response.arrayBuffer();
  return response.status === 200;
}

/** @returns PIDs of the DuckDB history workers the tool process started. */
export function historyWorkers(tool: ToolProcess): number[] {
  const listing = execFileSync("ps", ["-A", "-o", "pid=,ppid=,command="], { encoding: "utf8" });
  return listing
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter(
      (match) => match !== null && Number(match[2]) === tool.pid && /duckdb-worker/.test(match[3]!),
    )
    .map((match) => Number(match![1]));
}
