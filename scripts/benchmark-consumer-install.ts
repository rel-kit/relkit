/**
 * Records source ownership and serial external packed-consumer install samples.
 * Exact release packing/registry helpers supply first-party bytes. Independent
 * executable, declaration and production certification remains explicitly pending.
 */
import { resolve } from "node:path";
import { Effect } from "effect";
import { ConsumerBenchmark, consumerBenchmarkLayer } from "./consumer-benchmark.service.js";
import { consumerArtifacts } from "./consumer-artifacts.js";
import { consumerFixtures } from "./consumer-fixtures.js";
import { consumerRegistry } from "./consumer-registry.js";
import { consumerBenchmarkOptions } from "./consumer-benchmark-options.js";
import { inspectConsumerResources } from "./consumer-resources.js";
import { consumerInputFailure } from "./consumer-installation-native.js";
import { consumerRunContext, recordConsumerMeasurement } from "./consumer-benchmark-report.js";
import { runBenchmarkMain } from "./dev-readiness/benchmark-main.js";
import type {
  ConsumerBenchmarkOptions,
  ConsumerInstallSample,
  ConsumerMeasurement,
} from "./consumer-benchmark.types.js";

/**
 * Measures selected install fixtures in one registry scope, checkpointing each.
 * @param options - Explicit stage, artifact and fixture selections.
 * @param temporary - Run-owned external roots and raw sample reports.
 * @returns Lazy retained samples and exact artifact directory identity.
 */
const measureFixtures = Effect.fn("ConsumerBenchmark.samples")(function* (
  options: ConsumerBenchmarkOptions,
  temporary: string,
) {
  const artifacts = yield* consumerArtifacts(options.repository, temporary, options.artifacts);
  const registry = yield* consumerRegistry(temporary, artifacts.tarballs, artifacts.manifests);
  const creator = artifacts.tarballs.get("create-relkit");
  if (creator === undefined)
    return yield* consumerInputFailure("fixture.creator", "Creator candidate archive is absent");
  const matrix = yield* consumerFixtures(creator, artifacts.manifests);
  const fixtures = matrix.filter(
    (fixture) => options.fixtures.length === 0 || options.fixtures.includes(fixture.name),
  );
  if (fixtures.length === 0)
    return yield* consumerInputFailure(
      "fixture.selection",
      "No requested consumer fixtures matched",
    );
  const benchmark = yield* ConsumerBenchmark,
    samples: ConsumerInstallSample[] = [];
  for (const fixture of fixtures) {
    const admission = yield* inspectConsumerResources(temporary);
    if (admission.blocked !== null)
      return {
        samples,
        artifactDirectory: artifacts.directory,
        omitted: fixtures
          .filter((item) => !samples.some((sample) => sample.fixture === item.name))
          .map((item) => item.name),
        blocked: admission,
      };
    yield* Effect.logInfo("Measuring consumer installation", {
      fixture: fixture.name,
      manager: options.manager,
    });
    samples.push(
      ...(yield* benchmark.measure(
        fixture,
        options.manager,
        temporary,
        registry,
        options.retainInstallations ?? false,
      )),
    );
  }
  return {
    samples,
    artifactDirectory: artifacts.directory,
    omitted: matrix.filter((fixture) => !fixtures.includes(fixture)).map((fixture) => fixture.name),
    blocked: null,
  };
});

/**
 * Selects lightweight inventory or the actual packed installation matrix.
 * @param options - Explicit executable scope.
 * @param temporary - Run-owned root already identified in the report context.
 * @returns Lazy measurement with inventory-only omissions kept explicit.
 */
const selectedMeasurement = Effect.fn("ConsumerBenchmark.selection")(function* (
  options: ConsumerBenchmarkOptions,
  temporary: string,
) {
  if (options.inventoryOnly)
    return {
      samples: [],
      artifactDirectory: null,
      omitted: ["all-install-fixtures"],
      blocked: null,
    } satisfies ConsumerMeasurement;
  const admission = yield* inspectConsumerResources(temporary);
  if (admission.blocked !== null)
    return {
      samples: [],
      artifactDirectory: options.artifacts ?? null,
      omitted: ["all-install-fixtures"],
      blocked: admission,
    } satisfies ConsumerMeasurement;
  return yield* measureFixtures(options, temporary);
});

/**
 * Captures ownership and preserves an interrupted run's original outcome/report.
 * @param options - Explicit finite benchmark scope.
 * @returns Lazy report publication with interruption restored during measurement.
 */
export const benchmarkConsumerInstall = Effect.fn("ConsumerBenchmark.run")(function* (
  options: ConsumerBenchmarkOptions,
) {
  const context = yield* consumerRunContext(options);
  return yield* recordConsumerMeasurement(context, selectedMeasurement(options, context.temporary));
});

if (import.meta.main) {
  const options = consumerBenchmarkOptions(process.argv.slice(2), resolve(import.meta.dir, ".."));
  await runBenchmarkMain(
    benchmarkConsumerInstall(options).pipe(Effect.provide(consumerBenchmarkLayer), Effect.scoped),
  );
}
