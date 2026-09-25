import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Metric } from "effect";
import { expect, test } from "vitest";
import {
  appendLine,
  appendLineEffect,
  ensureDirectory,
  ensureSegmentRoot,
  ensureSegmentRootEffect,
  listSegments,
  listSegmentsEffect,
  repairSegments,
  repairSegmentsEffect,
  segmentDirectoryFor,
  segmentDirectoryForEffect,
  syncDirectory,
  syncDirectoryEffect,
  writeAtomic,
  writeAtomicEffect,
} from "../src/storage/segment-files.js";
test("segment file Effects preserve atomic writes and report tagged errors", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-files-effect-"));
  try {
    const registry = new Map();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const resolved = yield* ensureSegmentRootEffect(root);
        yield* repairSegmentsEffect(root);
        const destination = join(root, "index.json");
        yield* writeAtomicEffect(destination, "{}\n");
        yield* syncDirectoryEffect(root);
        const directory = yield* segmentDirectoryForEffect("log");
        const failure = yield* ensureSegmentRootEffect(" ").pipe(Effect.flip);
        const successes = yield* Metric.value(
          Metric.counter("relkit_observability_segment_files_total", {
            attributes: { operation: "ensureRoot", outcome: "success" },
          }),
        );
        const failures = yield* Metric.value(
          Metric.counter("relkit_observability_segment_files_total", {
            attributes: { operation: "ensureRoot", outcome: "failure" },
          }),
        );
        return { resolved, destination, directory, failure, successes, failures };
      }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
    );
    expect(result.resolved).toBe(root);
    expect(await readFile(result.destination, "utf8")).toBe("{}\n");
    expect(result.directory).toBe("logs");
    expect(result.failure).toMatchObject({ _tag: "SegmentFileError", operation: "ensureRoot" });
    expect(result.successes.count).toBe(1);
    expect(result.failures.count).toBe(1);
    await expect(ensureSegmentRoot(" ")).rejects.toThrow(TypeError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("Effect line append and segment listing retain record counts", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-files-list-"));
  const path = join(root, "segment-000001.active.ndjson");
  try {
    const handle = await open(path, "a+");
    try {
      await Effect.runPromise(appendLineEffect(handle, "{}\n"));
    } finally {
      await handle.close();
    }
    const files = await Effect.runPromise(listSegmentsEffect(root));
    expect(files).toMatchObject([{ path, active: true, records: 1 }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("segment file compatibility adapters delegate every filesystem operation", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-files-adapter-"));
  try {
    const dayRoot = join(root, "logs", "2026-09-25");
    await ensureDirectory(dayRoot);
    await repairSegments(root);
    const path = join(dayRoot, "segment-000001.active.ndjson");
    const handle = await open(path, "a+");
    try {
      await appendLine(handle, "{}\n");
    } finally {
      await handle.close();
    }
    expect(await listSegments(dayRoot)).toMatchObject([{ path, active: true, records: 1 }]);
    const atomicPath = join(root, "index.json");
    await writeAtomic(atomicPath, "{}\n");
    await syncDirectory(root);
    expect(await readFile(atomicPath, "utf8")).toBe("{}\n");
    expect(segmentDirectoryFor("log")).toBe("logs");
    expect(segmentDirectoryFor("unknown")).toBeUndefined();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
