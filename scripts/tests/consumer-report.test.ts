/**
 * Exercises report publication when measurement is interrupted or combines a
 * typed failure and defect. The original outcome remains authoritative and the
 * filesystem report survives without a package manager, registry or application.
 */
import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cause, Deferred, Effect, Exit, Fiber, Schema } from "effect";
import { recordConsumerMeasurement } from "../consumer-benchmark-report.js";
import type { ConsumerRunContext } from "../consumer-benchmark.types.js";

/**
 * Supplies one real isolated report root with no source/package observation claims.
 * @param root - Test-owned native directory.
 * @returns Context whose empty inventory is explicit test input.
 */
function context(root: string): ConsumerRunContext {
  return {
    id: "fixture",
    temporary: root,
    timestamp: "2026-10-21T00:00:00Z",
    ownership: [],
    options: {
      stage: "baseline",
      repository: root,
      output: join(root, "index.json"),
      inventoryOnly: false,
      fixtures: [],
      manager: "bun",
    },
    environment: {
      os: "fixture",
      release: "fixture",
      architecture: "fixture",
      cpus: 1,
      load: [0],
      freeMemoryBytes: 0,
      totalMemoryBytes: 0,
      bun: "fixture",
      bunNodeCompatibility: "fixture",
    },
  };
}

test("publishes interruption evidence before returning the interrupted outcome", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-report-cancel-"));
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        const ready = yield* Deferred.make<void>();
        const measurement = Deferred.succeed(ready, undefined).pipe(Effect.andThen(Effect.never));
        const child = yield* recordConsumerMeasurement(context(root), measurement).pipe(
          Effect.forkChild,
        );
        yield* Deferred.await(ready);
        yield* Fiber.interrupt(child);
        const exit = yield* Fiber.await(child);
        expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true);
      }),
    );
    const report = Schema.decodeUnknownSync(
      Schema.fromJsonString(
        Schema.Struct({
          failure: Schema.String,
          stageGatePassed: Schema.Boolean,
        }),
      ),
    )(await readFile(join(root, "index-fixture.json"), "utf8"));
    expect(report.failure).toMatch(/interrupt/i);
    expect(report.stageGatePassed).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retains typed failure and defect together after publishing their evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-report-cause-"));
  try {
    const cause = Cause.combine(
      Cause.fail(new Error("typed fixture failure")),
      Cause.die(new Error("fixture defect")),
    );
    const exit = await Effect.runPromise(
      recordConsumerMeasurement(context(root), Effect.failCause(cause)).pipe(Effect.exit),
    );
    expect(Exit.isFailure(exit) && Cause.hasFails(exit.cause) && Cause.hasDies(exit.cause)).toBe(
      true,
    );
    const report = await readFile(join(root, "index-fixture.json"), "utf8");
    expect(report).toContain("typed fixture failure");
    expect(report).toContain("fixture defect");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("retains the original failure when evidence publication itself fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "relkit-report-write-failure-"));
  try {
    await writeFile(join(root, "occupied"), "owned fixture file");
    const initial = context(root);
    const blocked = {
      ...initial,
      options: { ...initial.options, output: join(root, "occupied/index.json") },
    };
    const exit = await Effect.runPromise(
      recordConsumerMeasurement(
        blocked,
        Effect.fail(new Error("authoritative measurement failure")),
      ).pipe(Effect.exit),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.pretty(exit.cause)).toContain("authoritative measurement failure");
      expect(Cause.pretty(exit.cause)).toContain("report.directory");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
