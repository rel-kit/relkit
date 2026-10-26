/** Proves cancellation isolation and receipt retention against a real Node/DuckDB worker, with only owned temporary data. */
import { fork } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { createWorkerClientState } from "../src/local/worker-client-state.js";
import { sendWorkerCommand, closeWorkerClient } from "../src/local/worker-client-send.js";

const record = {
  key: "cancelled-write:1",
  origin: "application" as const,
  record: {
    version: 2 as const,
    signal: "log" as const,
    timestamp: new Date().toISOString(),
    level: "info" as const,
    component: "test",
    message: "retained",
    fields: {},
  },
};

test("cancelled reads and writes keep sibling queries, commits and replay on the same worker", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-worker-cancel-"));
  const child = fork(
    fileURLToPath(new URL("../dist/local/duckdb-worker.js", import.meta.url)),
    [],
    {
      execPath: "node",
      execArgv: [],
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    },
  );
  const failures: Error[] = [];
  const state = createWorkerClientState(child, (error) => failures.push(error));
  try {
    await sendWorkerCommand(state, { type: "open", root });
    const cancel = new AbortController();
    const append = sendWorkerCommand(state, { type: "append", records: [record] }, cancel.signal);
    cancel.abort();
    await expect(append).rejects.toMatchObject({ name: "AbortError" });
    for (let index = 0; index < 30; index++) {
      const controller = new AbortController();
      const read = sendWorkerCommand(
        state,
        { type: "query", kind: "logs", query: {} },
        controller.signal,
      );
      controller.abort();
      await expect(read).rejects.toMatchObject({ name: "AbortError" });
    }
    await sendWorkerCommand(state, { type: "append", records: [record] });
    expect(
      await sendWorkerCommand(state, { type: "query", kind: "logs", query: {} }),
    ).toMatchObject({ items: [{ message: "retained" }] });
    expect(state.pending.size).toBe(0);
    expect(child.connected).toBe(true);
    expect(failures).toEqual([]);
    expect(state.failure).toBeUndefined();
  } finally {
    await closeWorkerClient(state);
    await rm(root, { recursive: true, force: true });
  }
}, 20_000);
