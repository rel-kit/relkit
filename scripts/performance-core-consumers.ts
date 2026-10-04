import { measureSharedWatch } from "./performance-core-consumers-watch.js";
import { measureConsumerRoutes } from "./performance-core-consumers-routes.js";
import { environment } from "./performance-support.js";

/**
 * Replays bounded core-consumer workloads serially with existing measurement helpers.
 * @returns A report on stdout after every owned feed and loopback listener closes.
 * @remarks Requires Bun and built workspace public exports for the packages under measurement.
 * @example Run `rtk bun scripts/performance-core-consumers.ts` from the repository root.
 */
async function main(): Promise<void> {
  const started = performance.now();
  const deadlineMs = 60_000;
  const signal = AbortSignal.timeout(deadlineMs);
  const sharedWatch = await measureSharedWatch(signal);
  const routes = await measureConsumerRoutes(signal);
  console.log(
    JSON.stringify(
      {
        protocol: "relkit.performance.core-consumers",
        version: 1,
        environment: { ...environment(), command: "rtk bun scripts/performance-core-consumers.ts" },
        deadlineMs,
        elapsedMs: Number((performance.now() - started).toFixed(3)),
        measurements: { sharedWatch, ...routes },
        thresholds: { p50ReviewPercent: 5, p95ReviewPercent: 10 },
      },
      null,
      2,
    ),
  );
}

if (import.meta.main) await main();
