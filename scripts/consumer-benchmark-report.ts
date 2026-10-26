/**
 * Owns retained benchmark context and append-only report publication. Interrupted
 * runs publish their original Cause before the executable returns; reports never
 * infer the three unmeasured boundaries from installation observations.
 */
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { arch, cpus, freemem, loadavg, platform, release, tmpdir, totalmem } from "node:os";
import { basename, dirname, join } from "node:path";
import { Cause, Clock, Effect, Exit, Schema } from "effect";
import { inventoryConsumerOwnership } from "./consumer-ownership.js";
import { inspectionNative } from "./consumer-installation-native.js";
import { dependencyViolations } from "./consumer-dependency-policy.js";
import type {
  ConsumerBenchmarkOptions,
  ConsumerMeasurement,
  ConsumerRunContext,
} from "./consumer-benchmark.types.js";

/**
 * Captures the actual source inventory and machine identity for one run.
 * @param options - Explicit executable selections.
 * @returns Lazy context whose temporary directory belongs exclusively to this run.
 */
export const consumerRunContext = Effect.fn("ConsumerBenchmark.context")(function* (
  options: ConsumerBenchmarkOptions,
) {
  const temporary = yield* inspectionNative("benchmark.temporary", () =>
    mkdtemp(join(tmpdir(), "relkit-consumer-install-")),
  );
  const id = basename(temporary);
  const ownership = yield* inventoryConsumerOwnership(options.repository);
  const timestamp = new Date(yield* Clock.currentTimeMillis).toISOString();
  return {
    options,
    temporary,
    id,
    ownership,
    timestamp,
    environment: {
      os: platform(),
      release: release(),
      architecture: arch(),
      cpus: cpus().length,
      load: loadavg(),
      freeMemoryBytes: freemem(),
      totalMemoryBytes: totalmem(),
      bun: Bun.version,
      bunNodeCompatibility: process.version,
    },
  } satisfies ConsumerRunContext;
});

/**
 * Retains a unique report and appends its path without discarding prior attempts.
 * @typeParam A - Concrete serializable benchmark report.
 * @param output - Stage evidence index path.
 * @param id - Run-owned unique identity.
 * @param report - Observations including incomplete/failed outcomes.
 * @returns Lazy publication after native writes settle.
 */
const writeReport = Effect.fn("ConsumerBenchmark.report")(function* <A>(
  output: string,
  id: string,
  report: A,
) {
  yield* inspectionNative("report.directory", () => mkdir(dirname(output), { recursive: true }));
  const file = output.replace(/\.json$/, "") + `-${id}.json`;
  yield* inspectionNative("report.write", () =>
    writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" }),
  );
  const previous = yield* inspectionNative("report.index", () =>
    readFile(output, "utf8").catch((cause) => {
      if (cause instanceof Error && "code" in cause && cause.code === "ENOENT")
        return '{"runs":[]}';
      throw cause;
    }),
  );
  const index = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(Schema.Struct({ runs: Schema.Array(Schema.String) })),
  )(previous);
  yield* inspectionNative("report.index.write", () =>
    writeFile(output, JSON.stringify({ runs: [...index.runs, file] }, null, 2) + "\n"),
  );
});

/**
 * Publishes the observed matrix or original failure without claiming stage success.
 * @typeParam E - Original measurement failure, defect or interruption contract.
 * @param context - Source/machine identity captured before measurement.
 * @param outcome - Complete measurement exit, including interrupted native work.
 * @returns Lazy report publication; the executable re-emits the original failure.
 */
export const publishConsumerReport = Effect.fn("ConsumerBenchmark.publish")(function* <E>(
  context: ConsumerRunContext,
  outcome: Exit.Exit<ConsumerMeasurement, E>,
) {
  const { options, timestamp, temporary, environment, ownership } = context;
  const result = Exit.isSuccess(outcome) ? outcome.value : null;
  const violations =
    result?.samples.map((sample) => ({
      fixture: sample.fixture,
      condition: sample.condition,
      violations: dependencyViolations(sample.installation?.paths ?? [], {
        stage: "baseline",
        exceptions: [],
      }),
    })) ?? [];
  const report = {
    stage: options.stage,
    timestamp,
    temporary,
    options,
    environment,
    ownership,
    result,
    violations,
    failure: Exit.isFailure(outcome) ? Cause.pretty(outcome.cause) : null,
    boundaries: {
      installation: result?.samples.length ? "measured" : "incomplete",
      evaluation: "incomplete",
      declarations: "incomplete",
      artifact: "incomplete",
    },
    stageGatePassed: false,
    performanceCertified: false,
  };
  yield* writeReport(options.output, context.id, report);
  console.log(
    JSON.stringify({
      output: options.output,
      temporary,
      samples: result?.samples.length ?? 0,
      stageGatePassed: false,
    }),
  );
  return report;
});

/**
 * Restores cancellation for measurement and protects only its final evidence write.
 * @typeParam E - Original measurement failures retained without recovery.
 * @typeParam R - Genuine per-run services required by the measurement.
 * @param context - Run-owned report destination and source identity.
 * @param measurement - Lazy finite work whose complete outcome must be recorded.
 * @returns Published report or the original failure, defect or interruption Cause.
 */
export const recordConsumerMeasurement = Effect.fn("ConsumerBenchmark.record")(
  <E, R>(context: ConsumerRunContext, measurement: Effect.Effect<ConsumerMeasurement, E, R>) =>
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const outcome = yield* Effect.exit(restore(measurement));
        const publication = yield* Effect.exit(publishConsumerReport(context, outcome));
        if (Exit.isFailure(publication)) {
          if (Exit.isFailure(outcome))
            return yield* Effect.failCause(Cause.combine(outcome.cause, publication.cause));
          return yield* Effect.failCause(publication.cause);
        }
        if (Exit.isFailure(outcome)) return yield* Effect.failCause(outcome.cause);
        return publication.value;
      }),
    ),
);
