import { afterEach, describe, expect, test } from "bun:test";
import { appendFile, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJobStore } from "./src/jobs/store.ts";

const roots: string[] = [];

describe("local durable job store", () => {
  test("appends versioned records and recovers them", async () => {
    const root = await makeRoot();
    const first = await createJobStore(root);
    await first.append({ instanceId: "job-1", kind: "accepted", data: { b: 2, a: 1 } });
    await first.append({ instanceId: "job-2", kind: "accepted", data: { ok: true } });
    await first.close();

    const records = (await readFile(join(root, "records.ndjson"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(records.map((record) => [record.version, record.sequence])).toEqual([
      [1, 1],
      [1, 2],
    ]);

    const recovered = await createJobStore(root);
    expect(recovered.snapshot().records.map((record) => record.instanceId)).toEqual([
      "job-1",
      "job-2",
    ]);
    expect(recovered.snapshot().checkpoint).toMatchObject({
      version: 1,
      commit: 2,
      sequence: 2,
      recordCount: 2,
    });
    await recovered.close();
  });

  test("does not acknowledge before the record fsync boundary", async () => {
    const root = await makeRoot();
    const store = await createJobStore(root, {
      onBoundary: (boundary) => {
        if (boundary === "record-fsynced") throw new Error("injected fsync failure");
      },
    });
    await expect(
      store.append({ instanceId: "job-1", kind: "accepted", data: { ok: true } }),
    ).rejects.toThrow("injected fsync failure");
    await store.close();

    const recovered = await createJobStore(root);
    expect(recovered.snapshot().records).toHaveLength(1);
    await recovered.close();
  });

  test("repairs a torn index/checkpoint pair atomically on restart", async () => {
    const root = await makeRoot();
    let fail = true;
    const store = await createJobStore(root, {
      onBoundary: (boundary) => {
        if (boundary === "index-committed" && fail) {
          fail = false;
          throw new Error("injected metadata failure");
        }
      },
    });
    await expect(
      store.append({ instanceId: "job-1", kind: "accepted", data: { ok: true } }),
    ).rejects.toThrow("injected metadata failure");
    await store.close();

    const tornIndex = JSON.parse(await readFile(join(root, "index.json"), "utf8"));
    const oldCheckpoint = JSON.parse(await readFile(join(root, "checkpoint.json"), "utf8"));
    expect(tornIndex.commit).toBe(1);
    expect(oldCheckpoint.commit).toBe(0);

    const recovered = await createJobStore(root);
    const snapshot = recovered.snapshot();
    expect(snapshot.index.commit).toBe(snapshot.checkpoint.commit);
    expect(snapshot.checkpoint.recordCount).toBe(1);
    await recovered.close();
  });

  test("quarantines malformed records and metadata without blocking startup", async () => {
    const root = await makeRoot();
    const store = await createJobStore(root);
    await store.append({ instanceId: "job-1", kind: "accepted", data: { ok: true } });
    await store.close();
    await appendFile(join(root, "records.ndjson"), "not-json\n");
    await writeFile(join(root, "index.json"), "not-json");

    const recovered = await createJobStore(root);
    expect(recovered.snapshot().records).toHaveLength(1);
    expect(await readdir(join(root, ".relkit-quarantine"))).toHaveLength(2);
    await recovered.close();
  });
});

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "relkit-jobs-"));
  roots.push(root);
  return join(root, "jobs");
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
