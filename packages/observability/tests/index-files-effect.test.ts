import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Effect, Fiber, Metric } from "effect";
import { expect, test } from "vitest";
import {
  relativeSegmentPath,
  relativeSegmentPathEffect,
  scanObservabilitySegments,
  scanObservabilitySegmentsEffect,
  segmentName,
  segmentNameEffect,
} from "../src/storage/index-files.js";
test("index file Effect scans admitted lines and observes outcomes", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-index-files-"));
  try {
    const day = join(root, "logs", "2026-09-25");
    await mkdir(day, { recursive: true });
    await mkdir(join(root, "requests"));
    await mkdir(join(root, "traces"));
    const path = join(day, "segment-000001.ndjson");
    await writeFile(
      path,
      `${JSON.stringify({ version: 2, signal: "log", timestamp: "2026-09-25T00:00:00.000Z", level: "info", component: "test", message: "hello", fields: {} })}\n`,
    );
    const segments: string[] = [];
    const lines: string[] = [];
    const visitor = {
      segment: (segment: { path: string }) => void segments.push(segment.path),
      line: (line: { record: { message?: string } }) => void lines.push(line.record.message ?? ""),
    };
    const registry = new Map();
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        yield* scanObservabilitySegmentsEffect(root, undefined, visitor);
        const relative = yield* relativeSegmentPathEffect(root, path);
        const basename = yield* segmentNameEffect(path);
        const failure = yield* scanObservabilitySegmentsEffect(
          join(root, "missing"),
          undefined,
          visitor,
        ).pipe(Effect.flip);
        const successCount = yield* Metric.value(
          Metric.counter("relkit_observability_index_files_total", {
            attributes: { operation: "scan", outcome: "success" },
          }),
        );
        const failureCount = yield* Metric.value(
          Metric.counter("relkit_observability_index_files_total", {
            attributes: { operation: "scan", outcome: "failure" },
          }),
        );
        return { relative, basename, failure, successCount, failureCount };
      }).pipe(Effect.provideService(Metric.MetricRegistry, registry)),
    );
    expect(segments).toEqual([path]);
    expect(lines).toEqual(["hello"]);
    expect(result.relative).toBe("logs/2026-09-25/segment-000001.ndjson");
    expect(result.basename).toBe("segment-000001.ndjson");
    expect(result.failure).toMatchObject({ _tag: "IndexFileError", operation: "scan" });
    expect(result.successCount.count).toBe(1);
    expect(result.failureCount.count).toBe(1);
    expect(relativeSegmentPath(root, path)).toBe(result.relative);
    expect(segmentName(path)).toBe(result.basename);
    await scanObservabilitySegments(root, undefined, visitor);
    const failingVisitor = {
      segment: () => undefined,
      line: () => {
        throw new Error("visitor failed");
      },
    };
    await expect(
      Effect.runPromise(scanObservabilitySegmentsEffect(root, undefined, failingVisitor)),
    ).rejects.toMatchObject({ _tag: "IndexFileError", message: "visitor failed" });
    await expect(scanObservabilitySegments(root, undefined, failingVisitor)).rejects.toThrow(
      "visitor failed",
    );
    await expect(
      scanObservabilitySegments(join(root, "missing"), undefined, visitor),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("interrupting an index scan stops callbacks after the current visitor", async () => {
  const root = await mkdtemp(join("/tmp", "relkit-index-abort-"));
  try {
    const day = join(root, "logs", "2026-09-25");
    await mkdir(day, { recursive: true });
    await mkdir(join(root, "requests"));
    await mkdir(join(root, "traces"));
    await writeFile(
      join(day, "segment-000001.ndjson"),
      `${JSON.stringify({ version: 2, signal: "log", timestamp: "2026-09-25T00:00:00.000Z", level: "info", component: "test", message: "hello", fields: {} })}\n`,
    );
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    let lines = 0;
    const fiber = Effect.runFork(
      scanObservabilitySegmentsEffect(root, undefined, {
        segment: async () => {
          entered();
          await blocked;
        },
        line: () => {
          lines += 1;
        },
      }),
    );
    await started;
    const interrupted = Effect.runPromise(Fiber.interrupt(fiber));
    await Promise.resolve();
    release();
    await interrupted;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lines).toBe(0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
