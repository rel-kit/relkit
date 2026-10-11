/**
 * Supplies Bun-host process, HTTP and report adapters to the measured workflow.
 * The layer acquires no server; each start owns a process scope and HTTP probes
 * propagate cancellation. Connection refusal is an expected not-ready result.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { Context, Effect, Layer } from "effect";
import { ReadinessBenchmarkError } from "./benchmark-error.js";
import { startBenchmarkChild } from "./benchmark-process.js";
import { preflightBenchmarkPort, probeBenchmarkResponse } from "./benchmark-http.js";
import type { BenchmarkNativeOperations } from "./benchmark.types.js";

/** Native measurement authority substituted by the deterministic test layer. */
export class BenchmarkNative extends Context.Service<BenchmarkNative, BenchmarkNativeOperations>()(
  "relkit/ReadinessBenchmark/Native",
  {
    make: Effect.sync(
      () =>
        ({
          preflight: preflightBenchmarkPort,
          start: startBenchmarkChild,
          probe: probeBenchmarkResponse,
          report: Effect.fn("ReadinessBenchmark.report")((path: string, contents: string) =>
            Effect.tryPromise({
              try: async (signal) => {
                await mkdir(dirname(path), { recursive: true });
                await writeFile(path, contents, { signal });
              },
              catch: (cause) =>
                new ReadinessBenchmarkError({
                  operation: "report",
                  cause: new Error("Cannot write measurement report", { cause }),
                }),
            }),
          ),
        }) satisfies BenchmarkNativeOperations,
    ),
  },
) {}

/** Shared native graph; per-start resources belong to the caller's sample scope. */
export const benchmarkNativeLive = Layer.effect(BenchmarkNative, BenchmarkNative.make);
