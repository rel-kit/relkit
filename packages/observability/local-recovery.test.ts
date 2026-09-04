import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startLocalWorker } from "./src/local/worker-client";

test("unexpected worker exit fails pending/future work and requests a session restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-worker-failure-"));
  let failure: Error | undefined;
  const worker = startLocalWorker((error) => {
    failure = error;
  });
  try {
    await worker.call({ type: "open", root });
    await worker.call({ type: "close" });
    for (let attempt = 0; attempt < 100 && !failure; attempt++) await Bun.sleep(10);
    expect(failure?.message).toContain("Telemetry worker exited");
    await expect(worker.call({ type: "query", kind: "logs", query: {} })).rejects.toThrow();
  } finally {
    await worker.close();
    await rm(root, { recursive: true, force: true });
  }
});
