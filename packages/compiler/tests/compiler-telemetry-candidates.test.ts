/** Verifies candidate evaluator hooks own stdout/stderr and keep compiler telemetry out of inspected application output. */
import { expect, it } from "@effect/vitest";
import { Effect, Logger, References } from "effect";

import { acquireEvaluatorDetectors } from "../src/discovery/evaluator-detectors.js";
import { createEvaluatorRequestEffect } from "../src/discovery/evaluator-request.js";

it.effect("keeps compiler telemetry out of candidate output while hooks own the streams", () =>
  Effect.gen(function* () {
    let logs = 0;
    const report = yield* Effect.scoped(
      Effect.gen(function* () {
        const session = yield* acquireEvaluatorDetectors({
          projectRoot: process.cwd(),
          generatedDirectory: ".relkit/generated",
          networkAllowlist: [],
        });
        yield* createEvaluatorRequestEffect({
          projectRoot: process.cwd(),
          candidates: [],
          generationId: "telemetry-clean",
        });
        return yield* session.finishEffect();
      }),
    ).pipe(
      Effect.provideService(References.MinimumLogLevel, "Debug"),
      Effect.provide(
        Logger.layer([
          Logger.make(() => {
            logs++;
            process.stdout.write("compiler telemetry leak");
          }),
        ]),
      ),
    );
    expect(report).toEqual({ stdout: "", stderr: "", sideEffects: [] });
    expect(logs).toBe(0);
  }),
);
