/**
 * Runs the real fixture service with substitutable process/resource Layers.
 * Empty dependency fixtures exercise actual manifest/report writes and physical
 * inspection while a finite fake process prevents package downloads or children.
 */
import { expect, it } from "@effect/vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Layer } from "effect";
import { ConsumerBenchmark } from "../consumer-benchmark.service.js";
import { ConsumerResourceMonitor } from "../consumer-resources.js";
import { ScaffoldProcess } from "../scaffold-process.js";
import type { ScaffoldCommand } from "../scaffold-process.types.js";

const resources = { cpus: 10, load: 0, pressure: 1, availableDiskBytes: 10 * 1024 ** 3 };
const fixture = { name: "empty", dependencies: {}, devDependencies: {}, production: false };
const registry = { url: "http://127.0.0.1:1", archives: new Map(), transferredBytes: () => 0 };

/**
 * Acquires a fresh test root and removes only that root at scope closure.
 * @returns Lazy isolated native root with joined filesystem cleanup.
 */
function temporaryRoot() {
  return Effect.acquireRelease(
    Effect.promise(() => mkdtemp(join(tmpdir(), "relkit-benchmark-layer-"))),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  );
}

it.effect("captures process authority and records real cold/warm fixture observations", () =>
  Effect.gen(function* () {
    const root = yield* temporaryRoot();
    const commands: ScaffoldCommand[] = [];
    const layer = Layer.effect(ConsumerBenchmark, ConsumerBenchmark.make).pipe(
      Layer.provide([
        Layer.succeed(ScaffoldProcess, {
          run: (command) =>
            Effect.sync(() => {
              commands.push(command);
              return "finite fixture command";
            }),
        }),
        Layer.succeed(ConsumerResourceMonitor, {
          inspect: () => Effect.succeed({ resources, blocked: null }),
        }),
      ]),
    );
    const samples = yield* ConsumerBenchmark.use((service) =>
      service.measure(fixture, "bun", root, registry),
    ).pipe(Effect.provide(layer));
    expect(samples.map((sample) => sample.condition)).toEqual([
      "cold-owned-cache",
      "warm-owned-cache",
    ]);
    expect(samples.every((sample) => sample.installation?.missing.length === 0)).toBe(true);
    expect(commands).toHaveLength(2);
    expect(commands[0]?.args).toContain("--network-concurrency=1");
    expect(commands[0]?.args).toContain("--concurrent-scripts=1");
    expect(
      yield* Effect.promise(() => readFile(join(root, "empty-warm-owned-cache.json"), "utf8")),
    ).toContain('"physicalInstances": 0');
  }),
);

it.effect("does not invoke the process adapter after a resource rejection", () =>
  Effect.gen(function* () {
    const root = yield* temporaryRoot();
    const layer = Layer.effect(ConsumerBenchmark, ConsumerBenchmark.make).pipe(
      Layer.provide([
        Layer.succeed(ScaffoldProcess, {
          run: () => Effect.die(new Error("Rejected fixture must never execute")),
        }),
        Layer.succeed(ConsumerResourceMonitor, {
          inspect: () =>
            Effect.succeed({
              resources: { ...resources, pressure: 2 },
              blocked: "Deferred: memory pressure level 2",
            }),
        }),
      ]),
    );
    const samples = yield* ConsumerBenchmark.use((service) =>
      service.measure(fixture, "bun", root, registry),
    ).pipe(Effect.provide(layer));
    expect(samples).toEqual([]);
  }),
);
