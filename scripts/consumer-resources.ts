/**
 * Checks current machine headroom before expensive fixture work. The benchmark
 * normally defers new work under warning pressure, CPU saturation or low disk
 * space. Container gates can wait for headroom; benchmarks keep immediate deferral.
 * An explicit operator override retains observations while admitting work.
 */
import { execFileSync } from "node:child_process";
import { statfs } from "node:fs/promises";
import { cpus, loadavg, platform } from "node:os";
import { Context, Effect, Layer, Schedule } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { inspectionNative } from "./consumer-installation-native.js";
import type {
  ConsumerResourceMonitorContract,
  ConsumerResources,
} from "./consumer-resources.types.js";

/**
 * Determines whether a new serial fixture can fit remaining system headroom.
 * @param resources - Actual CPU, pressure and available-disk observations.
 * @returns Explicit backoff reason, or null when one serial task is admitted.
 */
export function consumerResourceBlock(resources: ConsumerResources): string | null {
  if (resources.pressure >= 2) return `Deferred: memory pressure level ${resources.pressure}`;
  if (resources.load >= Math.max(1, resources.cpus - 1))
    return `Deferred: CPU load ${resources.load} on ${resources.cpus} CPUs`;
  if (resources.availableDiskBytes < 4 * 1024 ** 3)
    return "Deferred: less than 4 GiB available disk space";
  return null;
}

/**
 * Reads native pressure and filesystem capacity before admitting costly work.
 * @param directory - Fixture volume whose available capacity constrains installs.
 * @returns Lazy snapshot and admission reason; native probe failures remain visible.
 */
export const inspectConsumerResources = Effect.fn("ConsumerResources.inspect")(
  function* (directory: string) {
    const disk = yield* inspectionNative("resources.disk", () => statfs(directory));
    const pressure = yield* inspectionNative("resources.pressure", async () =>
      platform() === "darwin"
        ? Number(
            execFileSync("/usr/sbin/sysctl", ["-n", "kern.memorystatus_vm_pressure_level"], {
              encoding: "utf8",
              timeout: 5000,
            }).trim(),
          )
        : 1,
    );
    const resources = {
      cpus: cpus().length,
      load: loadavg()[0] ?? 0,
      pressure,
      availableDiskBytes: disk.bavail * disk.bsize,
    };
    const blocked = consumerResourceBlock(resources);
    if (blocked !== null && process.env.RELKIT_CONSUMER_IGNORE_RESOURCE_LIMITS === "1") {
      yield* Effect.logInfo("Consumer resource admission explicitly overridden", {
        blocked,
        resources,
      });
      return { resources, blocked: null };
    }
    return { resources, blocked };
  },
  (effect) => observeExecution("testing", "consumer.resources", effect),
);

/** Captures fresh resource inspection authority without caching a machine snapshot. */
export class ConsumerResourceMonitor extends Context.Service<
  ConsumerResourceMonitor,
  ConsumerResourceMonitorContract
>()("relkit.scripts.ConsumerResourceMonitor", {
  make: Effect.succeed({ inspect: inspectConsumerResources }),
}) {}

/**
 * Waits for fresh headroom before container builds without relaxing admission limits.
 * @param directory - Fixture volume whose available capacity constrains work.
 * @returns Lazy admission after at most 30 ten-second waits; a final rejection remains blocked.
 * @remarks Requires ConsumerResourceMonitor. Probe failures and interruption propagate.
 */
export const awaitConsumerResources = Effect.fn("ConsumerResources.await")(
  function* (directory: string) {
    const monitor = yield* ConsumerResourceMonitor;
    return yield* monitor.inspect(directory).pipe(
      Effect.tap((admission) => Effect.logInfo("Container resource preflight", admission)),
      Effect.repeat({
        while: (admission) => admission.blocked !== null,
        times: 30,
        schedule: Schedule.spaced("10 seconds"),
      }),
    );
  },
  (effect) => observeExecution("testing", "consumer.resources.wait", effect),
);

/** Native implementation; tests substitute the same admission contract. */
export const consumerResourceMonitorLayer = Layer.effect(
  ConsumerResourceMonitor,
  ConsumerResourceMonitor.make,
);
