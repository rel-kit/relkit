import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../..");
const workerPath = join(import.meta.dir, "events-worker.ts");

type EventWorkerMode =
  "after-lease" | "after-ack" | "recover" | "ephemeral-loss" | "ephemeral-recover" | "fanout";

type Invocation = { readonly listener: string; readonly instanceId: string };

describe.serial("child-process event recovery", () => {
  test("recovers a durable listener after process loss", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "zsys-restart-events-"));
    try {
      const crashed = await runWorker("after-lease", stateRoot, 0);
      expect(crashed.exitCode).not.toBe(0);
      expect(await readInvocations(stateRoot)).toHaveLength(1);

      const restarted = await runWorker("recover", stateRoot, 10);
      expect(restarted.exitCode).toBe(0);
      expect(await readResult(stateRoot)).toMatchObject({
        state: "completed",
        attempt: 2,
        duplicate: true,
      });
      expect(await readInvocations(stateRoot)).toHaveLength(2);
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  test("makes a handler-success acknowledgement gap duplicate visible", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "zsys-restart-events-"));
    try {
      const crashed = await runWorker("after-ack", stateRoot, 0);
      expect(crashed.exitCode).not.toBe(0);
      expect(await readInvocations(stateRoot)).toHaveLength(1);

      const restarted = await runWorker("recover", stateRoot, 10);
      expect(restarted.exitCode).toBe(0);
      expect(await readResult(stateRoot)).toMatchObject({
        state: "completed",
        attempt: 2,
        duplicate: true,
      });
      expect(await readInvocations(stateRoot)).toHaveLength(2);
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  test("does not claim recovery for an ephemeral listener lost with its process", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "zsys-restart-events-"));
    try {
      const crashed = await runWorker("ephemeral-loss", stateRoot, 0);
      expect(crashed.exitCode).not.toBe(0);
      expect(await readInvocations(stateRoot)).toHaveLength(1);

      const restarted = await runWorker("ephemeral-recover", stateRoot, 0);
      expect(restarted.exitCode).toBe(0);
      const summary = await readResult<{
        readonly acceptedEnvelopes: number;
        readonly completed: number;
        readonly deliveryRootExists: boolean;
        readonly deliveries: number;
        readonly pending: number;
      }>(stateRoot);
      expect(summary).toEqual({
        acceptedEnvelopes: 1,
        completed: 0,
        deliveryRootExists: false,
        deliveries: 0,
        pending: 0,
      });
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  test("keeps one listener completion when another listener fails", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "zsys-restart-events-"));
    try {
      const result = await runWorker("fanout", stateRoot, 0);
      expect(result.exitCode).toBe(0);
      const summary = await readResult<{
        readonly completed: number;
        readonly listeners: readonly {
          readonly attempt: number;
          readonly id: string;
          readonly state: string;
          readonly status: string;
        }[];
      }>(stateRoot);
      expect(summary.completed).toBe(1);
      expect(summary.listeners).toEqual([
        { id: "orders.bad-listener", status: "failed", state: "dead-lettered", attempt: 1 },
        { id: "orders.good-listener", status: "completed", state: "completed", attempt: 1 },
      ]);
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});

async function runWorker(
  mode: EventWorkerMode,
  stateRoot: string,
  startTimeMs: number,
): Promise<{ readonly exitCode: number; readonly stderr: string }> {
  const child = Bun.spawn(
    [process.execPath, "run", workerPath, mode, stateRoot, String(startTimeMs)],
    { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" },
  );
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  const exitCode = await child.exited;
  await Promise.all([stdout, stderr]);
  return { exitCode, stderr: await stderr };
}

async function readInvocations(stateRoot: string): Promise<readonly Invocation[]> {
  const contents = await readFile(join(stateRoot, "invocations.ndjson"), "utf8").catch((cause) => {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw cause;
  });
  return contents
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Invocation);
}

async function readResult<Result = Record<string, unknown>>(stateRoot: string): Promise<Result> {
  return JSON.parse(await readFile(join(stateRoot, "result.json"), "utf8")) as Result;
}
