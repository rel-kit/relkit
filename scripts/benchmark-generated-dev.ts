/**
 * Runs the command-to-response harness against an installed generated project.
 * This driver owns the native/test layer graph and emits every launch plus raw
 * host identity and strict aggregate gates. Preparation and installation happen
 * before invoking it; measured commands themselves always remain literal bun dev.
 */
import { resolve } from "node:path";
import { Effect, Layer } from "effect";
import { BenchmarkNative, benchmarkNativeLive } from "./dev-readiness/benchmark-native.service.js";
import {
  ReadinessBenchmark,
  readinessBenchmarkLive,
  summarizeStarts,
} from "./dev-readiness/benchmark.service.js";
import { benchmarkReportEffect } from "./dev-readiness/benchmark-report.js";
import { benchmarkHostIdentity } from "./dev-readiness/benchmark-host.js";
import { runBenchmarkMain } from "./dev-readiness/benchmark-main.js";

/**
 * Reads one driver option without altering the measured project's command.
 * @param name - Literal driver flag.
 * @param fallback - Default value when the flag is omitted.
 * @returns Its supplied value or the declared default.
 */
function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : (process.argv[index + 1] ?? fallback);
}

/**
 * Acquires the measurement graph and writes every sample, including failed starts.
 * @returns Driver completion after report I/O and every child's cleanup.
 */
const main = Effect.fn("ReadinessBenchmark.main")(function* () {
  const root = resolve(option("--project-root", "."));
  const count = Number(option("--runs", "20"));
  if (!Number.isSafeInteger(count) || count < 1 || count > 100)
    return yield* Effect.die(new Error("--runs must be between 1 and 100"));
  const benchmark = yield* ReadinessBenchmark;
  const request = {
    projectRoot: root,
    environment: { ...process.env },
    url: option("--url", "http://127.0.0.1:3000/hello?name=RelKit"),
    expectedStatus: 200,
    expectedBody: option("--expected-body", '{"message":"Hello, RelKit!"}'),
    deadlineMs: Number(option("--deadline-ms", "30000")),
  };
  const attempts = yield* Effect.forEach(
    Array.from({ length: count }, (_, index) => index + 1),
    (run) => benchmarkReportEffect(benchmark, request, run),
    { concurrency: 1 },
  );
  const samples = attempts.flatMap((attempt) =>
    attempt.sample === undefined ? [] : [attempt.sample],
  );
  const summary = summarizeStarts(samples, 500);
  const report = {
    protocol: "relkit.dev-readiness",
    version: 1,
    command: "bun dev",
    mode: option("--mode", "baseline"),
    environment: benchmarkHostIdentity(),
    request: {
      projectRoot: root,
      url: request.url,
      expectedStatus: request.expectedStatus,
      expectedBody: request.expectedBody,
    },
    attempts,
    summary: { ...summary, passed: summary.passed && samples.length === count },
  };
  const contents = JSON.stringify(report, null, 2) + "\n";
  yield* (yield* BenchmarkNative).report(
    resolve(option("--output", ".relkit/dev-readiness.json")),
    contents,
  );
  yield* Effect.sync(() => console.log(contents));
});

if (import.meta.main)
  await runBenchmarkMain(
    main().pipe(
      Effect.provide(readinessBenchmarkLive.pipe(Layer.provideMerge(benchmarkNativeLive))),
    ),
  );
