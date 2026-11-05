/**
 * Records the host that produced a development-loop report. Reads OS facts and the GitHub
 * Actions runner variables once, outside any timed section; the docs benchmarks page shows
 * this record next to the numbers it measured.
 */
import { arch, cpus, platform, release, totalmem } from "node:os";
import type { BenchmarkHost } from "./benchmark.types.js";

/**
 * Captures the executing host.
 * @param environment - Process environment, read for the CI runner identity.
 * @returns Runtime, OS, CPU, memory and runner identity.
 */
export function benchmarkHost(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): BenchmarkHost {
  const processors = cpus();
  const runner =
    environment.GITHUB_ACTIONS === "true"
      ? `github-actions ${environment.ImageOS ?? environment.RUNNER_OS ?? "runner"} ${environment.ImageVersion ?? ""}`.trim()
      : "local";
  return {
    bun: Bun.version,
    platform: platform(),
    arch: arch(),
    os: release(),
    cpu: processors[0]?.model,
    cpus: processors.length,
    memoryBytes: totalmem(),
    runner,
  };
}
