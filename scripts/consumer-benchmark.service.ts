/**
 * Owns serial external install measurements using the existing native process
 * service. Each fixture has isolated cache/state; warm reinstall follows cold
 * measurement, and successful owned installations are released after reporting.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Context, Effect, Layer } from "effect";
import { ScaffoldProcess, scaffoldProcessLayer } from "./scaffold-process.js";
import { inspectionNative } from "./consumer-installation-native.js";
import { measureConsumerInstall } from "./consumer-install-sample.js";
import { ConsumerResourceMonitor, consumerResourceMonitorLayer } from "./consumer-resources.js";
import type { ConsumerResourceMonitorContract } from "./consumer-resources.types.js";
import type {
  ConsumerFixture,
  ConsumerInstallSample,
  ConsumerManager,
} from "./consumer-benchmark.types.js";
import type { ConsumerRegistry } from "./consumer-registry.types.js";

/**
 * Materializes one external dependency manifest without application evaluation.
 * @param root - Newly owned fixture root.
 * @param fixture - Exact dependency selection measured by the fixture.
 * @returns Lazy completion after its native filesystem writes settle.
 */
const writeFixture = Effect.fn("ConsumerBenchmark.writeFixture")(function* (
  root: string,
  fixture: ConsumerFixture,
) {
  yield* inspectionNative("fixture.directory", () => mkdir(root, { recursive: true }));
  yield* inspectionNative("fixture.write", () =>
    writeFile(
      join(root, "package.json"),
      JSON.stringify(
        {
          name: `relkit-footprint-${fixture.name}`,
          private: true,
          version: "0.0.0",
          type: "module",
          dependencies: fixture.dependencies,
          devDependencies: fixture.devDependencies,
        },
        null,
        2,
      ) + "\n",
    ),
  );
});

/**
 * Runs a cold/warm pair against one exact dependency selection.
 * @param run - Captured native process capability.
 * @param fixture - Install-only dependency selection.
 * @param manager - Explicit fixture package manager/layout.
 * @param parent - Measurement-owned parent retaining reports and failed roots.
 * @param registry - Scope-owned candidate registry.
 * @param inspect - Captured authority returning a fresh resource admission.
 * @returns Lazy sample pair after successful owned installation/cache cleanup.
 */
const measureFixture = Effect.fn("ConsumerBenchmark.fixture")(function* (
  run: Effect.Success<typeof ScaffoldProcess.make>["run"],
  fixture: ConsumerFixture,
  manager: ConsumerManager,
  parent: string,
  registry: ConsumerRegistry,
  inspect: ConsumerResourceMonitorContract["inspect"],
  retainInstallations: boolean,
) {
  const root = join(parent, fixture.name),
    cache = join(parent, fixture.name + "-cache");
  yield* writeFixture(root, fixture);
  const samples: ConsumerInstallSample[] = [];
  for (const condition of ["cold-owned-cache", "warm-owned-cache"] as const) {
    const admission = yield* inspect(parent);
    if (admission.blocked !== null) {
      yield* Effect.logWarning(admission.blocked, admission.resources);
      break;
    }
    const sample = yield* measureConsumerInstall(
      run,
      fixture,
      manager,
      root,
      cache,
      registry,
      condition,
    );
    samples.push(sample);
    yield* inspectionNative("sample.write", () =>
      writeFile(
        join(parent, `${fixture.name}-${condition}.json`),
        JSON.stringify(sample, null, 2) + "\n",
      ),
    );
    if (sample.failure !== null) return samples;
    if (!retainInstallations || condition === "cold-owned-cache")
      yield* inspectionNative("fixture.release-install", () =>
        rm(join(root, "node_modules"), { recursive: true, force: true }),
      );
  }
  yield* inspectionNative("fixture.release-cache", () =>
    rm(cache, { recursive: true, force: true }),
  );
  return samples;
});

/** Captures native command authority once; the caller Scope owns registry lifetime. */
export class ConsumerBenchmark extends Context.Service<ConsumerBenchmark>()(
  "relkit.scripts.ConsumerBenchmark",
  {
    make: Effect.gen(function* () {
      const process = yield* ScaffoldProcess;
      const resources = yield* ConsumerResourceMonitor;
      return {
        /**
         * Measures one fixture while retaining all failed evidence.
         * @param fixture - Exact selected dependencies.
         * @param manager - Explicit installed manager/layout.
         * @param parent - Benchmark-owned evidence directory.
         * @param registry - Borrowed registry within the caller's Scope.
         * @returns Lazy cold/warm samples with joined native child ownership.
         */
        measure: (
          fixture: ConsumerFixture,
          manager: ConsumerManager,
          parent: string,
          registry: ConsumerRegistry,
          retainInstallations = false,
        ) =>
          measureFixture(
            process.run,
            fixture,
            manager,
            parent,
            registry,
            resources.inspect,
            retainInstallations,
          ),
      };
    }),
  },
) {}

/** Live measurement composition reuses the existing command lifecycle contract. */
export const consumerBenchmarkLayer = Layer.effect(ConsumerBenchmark, ConsumerBenchmark.make).pipe(
  Layer.provide([scaffoldProcessLayer, consumerResourceMonitorLayer]),
);
