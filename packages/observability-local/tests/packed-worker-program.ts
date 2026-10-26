/** Genuine installed-package Node worker program; pre-extraction fixture bytes are seeded by its caller. */
export const packedWorkerProgram = `
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { startLocalWorker } from "@relkit/observability-local";

/** Waits for this owned child to disappear; other native errors remain failures. */
async function disappeared(pid) {
  assert.equal(typeof pid, "number");
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); }
    catch (cause) {
      if (cause instanceof Error && "code" in cause && cause.code === "ESRCH") return;
      throw new Error("Cannot inspect owned worker PID", { cause });
    }
    await delay(25);
  }
  throw new Error("Owned worker PID survived close: " + pid);
}

/** Joins physical worker exit even if its close acknowledgement rejects. */
async function close(worker) {
  try { await worker.close(); }
  finally { await disappeared(worker.pid); }
}

/** Opens retained history through the installed worker's existing IPC contract. */
async function open(worker) {
  assert.deepEqual(await worker.call({
    type: "open", root: "history", retention: { maxAgeMs: Number.MAX_SAFE_INTEGER },
  }), { records: 0, malformed: 0 });
}

/** Commits through real IPC and checks the unchanged native sequence cursor. */
async function append(worker, key, cursor) {
  const records = await worker.call({ type: "append", records: [{
    key, origin: "application", record: {
      version: 2, signal: "log", timestamp: new Date().toISOString(), level: "info",
      component: "packed", message: "native worker", fields: {},
    },
  }] });
  assert.equal(records[0].cursor, cursor);
}

const fresh = startLocalWorker();
try {
  await fresh.call({ type: "open", root: "fresh-history" });
  await append(fresh, "packed-owner:1", "1");
} finally { await close(fresh); }

const first = startLocalWorker();
try {
  await open(first);
  const existing = await first.call({ type: "query", kind: "logs", query: {} });
  assert.equal(existing.items.length, 1);
  assert.equal(existing.items[0].cursor, "41");
  assert.equal(existing.items[0].message, "retained history");
  await append(first, "packed-owner:42", "42");
} finally { await close(first); }

const reopened = startLocalWorker();
try {
  await open(reopened);
  const retained = await reopened.call({ type: "query", kind: "logs", query: {} });
  assert.deepEqual(retained.items.map(item => [item.cursor, item.message]).sort(), [
    ["41", "retained history"], ["42", "native worker"],
  ]);
} finally { await close(reopened); }
console.log(JSON.stringify({ freshCursor: "1", retainedCursors: ["41", "42"], reopened: true,
  exitedPids: [fresh.pid, first.pid, reopened.pid] }));
`;
