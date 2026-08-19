import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "bun:test";

const repositoryRoot = resolve(import.meta.dir, "../..");
const workerPath = join(import.meta.dir, "jobs-worker.ts");
const jobRootName = join("jobs", encodeURIComponent("tests.restart.jobs"));

type StoredRecord = {
  readonly kind: string;
  readonly instanceId: string;
  readonly data: Record<string, unknown>;
};

describe.serial("child-process job restart recovery", () => {
  test("recovers an expired lease after the worker is killed", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "zsys-restart-jobs-"));
    try {
      const crashed = await runWorker("after-lease", stateRoot, 0);
      expect(crashed.exitCode).not.toBe(0);

      const prior = await readRecords(stateRoot);
      expect(prior).toHaveLength(3);
      expect(prior.at(-1)).toMatchObject({
        kind: "leased",
        data: { attempt: 1, leaseExpiresAt: 10 },
      });

      const restarted = await runWorker("recover", stateRoot, 10);
      expect(restarted.exitCode).toBe(0);
      const records = await readRecords(stateRoot);
      expect(records.slice(0, prior.length)).toEqual(prior);
      expect(records.at(-1)).toMatchObject({ kind: "completed" });
      expect(await readInvocations(stateRoot)).toEqual([{ orderId: "order-1", attempt: 2 }]);
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });

  test("makes a handler-success acknowledgement gap duplicate visible after restart", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "zsys-restart-jobs-"));
    try {
      const crashed = await runWorker("after-ack", stateRoot, 0);
      expect(crashed.exitCode).not.toBe(0);

      const prior = await readRecords(stateRoot);
      expect(prior).toHaveLength(3);
      expect(prior.at(-1)).toMatchObject({ kind: "leased" });
      expect(await readInvocations(stateRoot)).toEqual([{ orderId: "order-1", attempt: 1 }]);

      const restarted = await runWorker("recover", stateRoot, 10);
      expect(restarted.exitCode).toBe(0);
      const records = await readRecords(stateRoot);
      expect(records.slice(0, prior.length)).toEqual(prior);
      expect(records.at(-1)).toMatchObject({ kind: "completed" });
      expect(await readInvocations(stateRoot)).toEqual([
        { orderId: "order-1", attempt: 1 },
        { orderId: "order-1", attempt: 2 },
      ]);
    } finally {
      await rm(stateRoot, { recursive: true, force: true });
    }
  });
});

async function runWorker(
  mode: "after-lease" | "after-ack" | "recover",
  stateRoot: string,
  startTimeMs: number,
): Promise<{ readonly exitCode: number; readonly stderr: string }> {
  const child = Bun.spawn(
    [process.execPath, "run", workerPath, mode, stateRoot, String(startTimeMs)],
    { cwd: repositoryRoot, stdout: "pipe", stderr: "pipe" },
  );
  const stderr = new Response(child.stderr).text();
  const exitCode = await child.exited;
  await Promise.all([new Response(child.stdout).text(), stderr]);
  return { exitCode, stderr: await stderr };
}

async function readRecords(stateRoot: string): Promise<readonly StoredRecord[]> {
  const contents = await readFile(join(stateRoot, jobRootName, "records.ndjson"), "utf8");
  return contents
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StoredRecord);
}

async function readInvocations(
  stateRoot: string,
): Promise<readonly { readonly orderId: string; readonly attempt: number }[]> {
  const contents = await readFile(join(stateRoot, "invocations.ndjson"), "utf8").catch((cause) => {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw cause;
  });
  return contents
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { readonly orderId: string; readonly attempt: number });
}
