/**
 * Checks a serialized four-boundary consumer report against its measured policy.
 * It performs no installations or application evaluation. Missing evidence and
 * forbidden dependency paths both produce a nonzero verification result.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Effect, Schema } from "effect";
import { checkConsumerBoundaries } from "./consumer-boundaries.js";
import {
  ConsumerBoundaryEvidence,
  ConsumerMeasuredEvidence,
} from "./consumer-boundaries.schemas.js";
import { consumerInputFailure, inspectionNative } from "./consumer-installation-native.js";
import { runBenchmarkMain } from "./dev-readiness/benchmark-main.js";

/**
 * Decodes a measured report and prints a deterministic completeness verdict.
 * @param file - Evidence JSON produced by external consumer verification.
 * @param stage - Explicit requested policy stage, checked against the report.
 * @returns Lazy gate result with native/decode failures preserved.
 */
export const checkConsumerDependencies = Effect.fn("ConsumerDependencies.check")(function* (
  file: string,
  stage: string,
) {
  const text = yield* inspectionNative("evidence.read", () => readFile(file, "utf8"));
  const raw = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Json))(text);
  if (!Schema.is(ConsumerBoundaryEvidence)(raw)) {
    const measured = yield* Schema.decodeUnknownEffect(ConsumerMeasuredEvidence)(raw);
    if (stage !== measured.stage)
      return yield* consumerInputFailure(
        "evidence.stage",
        `Evidence stage ${measured.stage} does not match requested ${stage}`,
      );
    const samples = measured.result?.samples ?? [];
    return checkConsumerBoundaries(
      [
        {
          boundary: "installation",
          evidence: file,
          complete:
            samples.length > 0 &&
            samples.every(
              (sample) => sample.installation !== null && sample.installation.missing.length === 0,
            ),
          paths: samples.flatMap((sample) => sample.installation?.paths ?? []),
        },
      ],
      { stage: measured.stage, exceptions: [] },
    );
  }
  const evidence = raw;
  if (stage !== evidence.policy.stage)
    return yield* consumerInputFailure(
      "evidence.stage",
      `Evidence stage ${evidence.policy.stage} does not match requested ${stage}`,
    );
  return checkConsumerBoundaries(evidence.observations, evidence.policy);
});

if (import.meta.main) {
  const args = process.argv.slice(2);
  const stage = args[args.indexOf("--stage") + 1];
  const file = args[args.indexOf("--evidence") + 1];
  if (
    !args.includes("--stage") ||
    !args.includes("--evidence") ||
    stage === undefined ||
    file === undefined
  )
    throw new Error(
      "Usage: bun scripts/check-consumer-dependencies.ts --stage <baseline|1|final> --evidence <report.json>",
    );
  const result = await runBenchmarkMain(checkConsumerDependencies(resolve(file), stage));
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}
