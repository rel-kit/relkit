/** Executes the actual moved commerce task through native job admission, worker envelopes, build pinning and run observation. */
import { expect, test } from "bun:test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Effect, Schema } from "effect";
import { createJobsRuntime, isJobDescriptor } from "../../../packages/jobs/src/index.js";
import { createTestJobsAdapter } from "../../../packages/testing/src/index.js";
import { scaffoldNative } from "../../../scripts/scaffold-native.js";
import { verifyNativeTaskRun } from "./commerce-layout-task-run.js";
import { JobsManifest } from "../../../packages/compiler/src/jobs/manifest-schema.js";

test(
  "paired native task admission retains schedules, pinned builds and original executable ownership",
  () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const job = yield* scaffoldNative("commerce.tasks.original", loadOriginalJob);
          const manifest = yield* scaffoldNative("commerce.tasks.manifest", () =>
            Bun.file(
              join(process.cwd(), "examples/commerce/.relkit/generated/jobs.manifest.json"),
            ).text(),
          ).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(JobsManifest))));
          expect(job).toMatchObject({
            id: "orders.cleanup",
            name: "cleanupOrders",
            task: { id: "orders.cleanup", version: "1", execution: "retryable" },
            schedules: [
              { id: "dailyCleanup", cron: "0 0 * * *", timezone: "UTC", misfire: "skip" },
            ],
          });
          const adapter = yield* Effect.acquireRelease(
            Effect.sync(() => createTestJobsAdapter({ service: "default", startTimeMs: 0 })),
            (adapter) =>
              scaffoldNative("commerce.tasks.close", () => adapter.close()).pipe(Effect.orDie),
          );
          const runtime = createJobsRuntime({
            manifest,
            adapter,
            jobs: [job],
            application: "commerce-api",
            environment: "test",
            service: "default",
            scope: "tenant-a",
          });
          yield* verifyNativeTaskRun(job, runtime, adapter);
        }),
      ),
    ),
  15_000,
);

/**
 * Loads the original compiler-discovered native descriptor at the current physical source path.
 * @returns The exact native job/task object after the authoritative descriptor guard succeeds.
 */
async function loadOriginalJob() {
  const root = join(process.cwd(), "examples/commerce/src");
  const grouped = await Bun.file(join(root, "services/orders/service.ts")).exists();
  const namespace = await import(
    pathToFileURL(join(root, grouped ? "services/orders" : "orders", "jobs/cleanup-orders.job.ts"))
      .href
  );
  const value = Reflect.get(namespace, "default");
  if (!isJobDescriptor(value)) throw new Error("Original native job descriptor is missing");
  return value;
}
