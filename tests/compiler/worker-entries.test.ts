import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  jobWorkerPath,
  writeJobWorkerEntries,
  type JobsManifestWorkerEntry,
} from "../../packages/compiler/src/index.ts";

function entry(jobId: string, buildId = "sha256:build-1"): JobsManifestWorkerEntry {
  return {
    jobId,
    taskId: "orders.send",
    buildId,
    serviceGeneration: "sha256:service-1",
    path: `.relkit/build/jobs/${buildId}/sha256:service-1/worker.js`,
  };
}

describe("immutable job worker entries", () => {
  test("writes deterministic worker and routing files without rewriting unchanged bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "relkit-job-workers-"));
    try {
      const first = await writeJobWorkerEntries([entry("orders.send")], {
        buildDirectory: directory,
      });
      const worker = jobWorkerPath(directory, entry("orders.send"));
      const before = await stat(worker);
      expect(first.changed).toBe(true);
      expect(await readFile(worker, "utf8")).toContain('"buildId":"sha256:build-1"');
      expect(
        await readFile(
          join(directory, "jobs", "sha256:build-1", "sha256:service-1", "routing.manifest.json"),
          "utf8",
        ),
      ).toContain('"jobId":"orders.send"');

      const second = await writeJobWorkerEntries([entry("orders.send")], {
        buildDirectory: directory,
      });
      const after = await stat(worker);
      expect(second.changed).toBe(false);
      expect(after.mtimeNs).toBe(before.mtimeNs);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("preflights every path so an immutable conflict cannot partially activate a build", async () => {
    const directory = await mkdtemp(join(tmpdir(), "relkit-job-workers-"));
    try {
      await writeJobWorkerEntries([entry("orders.first", "sha256:build-1")], {
        buildDirectory: directory,
      });
      await expect(
        writeJobWorkerEntries(
          [
            entry("orders.new", "sha256:build-2"),
            { ...entry("orders.first", "sha256:build-1"), taskId: "orders.changed" },
          ],
          { buildDirectory: directory },
        ),
      ).rejects.toMatchObject({ code: "RELKIT_JOB_WORKER_IMMUTABLE_CONFLICT" });
      await expect(readdir(join(directory, "jobs", "sha256:build-2"))).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("keeps implicit routing when a second binding uses the same worker", async () => {
    const directory = await mkdtemp(join(tmpdir(), "relkit-job-workers-"));
    try {
      await writeJobWorkerEntries([entry("orders.send")], { buildDirectory: directory });
      await expect(
        writeJobWorkerEntries([entry("orders.send-public")], { buildDirectory: directory }),
      ).resolves.toMatchObject({ changed: true });

      const routing = JSON.parse(
        await readFile(
          join(directory, "jobs", "sha256:build-1", "sha256:service-1", "routing.manifest.json"),
          "utf8",
        ),
      ) as { readonly entries: readonly { readonly jobId: string }[] };
      expect(routing.entries.map((routingEntry) => routingEntry.jobId)).toEqual([
        "orders.send",
        "orders.send-public",
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
