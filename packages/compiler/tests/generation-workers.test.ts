import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import type { JobsManifestWorkerEntry } from "../src/jobs/manifest.js";
import {
  JobWorkerConflictError,
  jobWorkerPath,
  writeJobWorkerEntries,
  writeJobWorkerEntriesEffect,
} from "../src/jobs/worker-entries.js";

const entry = (jobId: string, buildId = "build-one"): JobsManifestWorkerEntry => ({
  jobId,
  taskId: "task-one",
  buildId,
  serviceGeneration: "generation-one",
  path: "unused",
});

const directory = Effect.acquireRelease(
  Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-workers-"))),
  (path) => Effect.promise(() => rm(path, { recursive: true, force: true })),
);

describe("job worker effects", () => {
  it.effect("preflights every immutable worker before writing new build paths", () =>
    Effect.gen(function* () {
      const buildDirectory = yield* directory;
      yield* writeJobWorkerEntriesEffect([entry("old-job")], { buildDirectory });
      const previous = jobWorkerPath(buildDirectory, entry("old-job"));
      const next = jobWorkerPath(buildDirectory, entry("new-job", "build-two"));
      yield* Effect.promise(() => writeFile(previous, "conflicting immutable bytes"));
      const failure = yield* writeJobWorkerEntriesEffect(
        [entry("new-job", "build-two"), entry("old-job")],
        { buildDirectory },
      ).pipe(Effect.flip);
      expect(failure).toBeInstanceOf(JobWorkerConflictError);
      expect(failure).toMatchObject({
        code: "RELKIT_JOB_WORKER_IMMUTABLE_CONFLICT",
        path: previous,
      });
      yield* Effect.promise(() =>
        expect(readdir(dirname(next))).rejects.toMatchObject({ code: "ENOENT" }),
      );
    }),
  );

  it.effect("retains historical routing when another job uses the same worker", () =>
    Effect.gen(function* () {
      const buildDirectory = yield* directory;
      yield* writeJobWorkerEntriesEffect([entry("z-job")], { buildDirectory });
      const report = yield* writeJobWorkerEntriesEffect([entry("a-job")], { buildDirectory });
      expect(report.workers[0]?.changed).toBe(false);
      expect(report.routingManifests[0]?.changed).toBe(true);
      const routing = join(
        dirname(jobWorkerPath(buildDirectory, entry("z-job"))),
        "routing.manifest.json",
      );
      const source = yield* Effect.promise(() => readFile(routing, "utf8"));
      expect(source).toContain('"jobId":"a-job"');
      expect(source).toContain('"jobId":"z-job"');
      expect(source.indexOf('"jobId":"a-job"')).toBeLessThan(source.indexOf('"jobId":"z-job"'));
    }),
  );

  it.effect("rejects malformed persisted routing with the existing public conflict error", () =>
    Effect.gen(function* () {
      const buildDirectory = yield* directory;
      yield* writeJobWorkerEntriesEffect([entry("job-one")], { buildDirectory });
      const routing = join(
        dirname(jobWorkerPath(buildDirectory, entry("job-one"))),
        "routing.manifest.json",
      );
      yield* Effect.promise(() =>
        writeFile(
          routing,
          JSON.stringify({
            protocol: "relkit.jobs-routing",
            version: 1,
            buildId: "build-one",
            serviceGeneration: "generation-one",
            entries: [{ jobId: 7 }],
          }),
        ),
      );
      const failure = yield* writeJobWorkerEntriesEffect([entry("job-two")], {
        buildDirectory,
      }).pipe(Effect.flip);
      expect(failure).toBeInstanceOf(JobWorkerConflictError);
      expect(failure).toMatchObject({ path: routing });
      yield* Effect.promise(() =>
        expect(
          writeJobWorkerEntries([entry("job-two")], { buildDirectory }),
        ).rejects.toBeInstanceOf(JobWorkerConflictError),
      );
    }),
  );

  it.effect("retains excess historical entry fields when checking immutable conflicts", () =>
    Effect.gen(function* () {
      const buildDirectory = yield* directory;
      const original = entry("job-one");
      yield* writeJobWorkerEntriesEffect([original], { buildDirectory });
      const routing = join(
        dirname(jobWorkerPath(buildDirectory, original)),
        "routing.manifest.json",
      );
      yield* Effect.promise(() =>
        writeFile(
          routing,
          JSON.stringify({
            protocol: "relkit.jobs-routing",
            version: 1,
            buildId: original.buildId,
            serviceGeneration: original.serviceGeneration,
            entries: [
              {
                jobId: original.jobId,
                taskId: original.taskId,
                buildId: original.buildId,
                serviceGeneration: original.serviceGeneration,
                legacyMetadata: true,
              },
            ],
          }),
        ),
      );
      const failure = yield* writeJobWorkerEntriesEffect([original], { buildDirectory }).pipe(
        Effect.flip,
      );
      expect(failure).toBeInstanceOf(JobWorkerConflictError);
      expect(failure).toMatchObject({ path: routing });
    }),
  );
});
