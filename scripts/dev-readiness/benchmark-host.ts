/**
 * Reads native host metadata at the benchmark boundary outside timed launches.
 * Drivers share this small synchronous adapter to record the actual Bun runtime,
 * OS, architecture, CPU and load without retaining environment configuration.
 */
import { arch, cpus, loadavg, platform, release } from "node:os";

/**
 * Captures the executing host at report construction.
 * @returns Physical/tool identity and sampled load; it does not certify host control.
 */
export function benchmarkHostIdentity() {
  return {
    bun: Bun.version,
    platform: platform(),
    arch: arch(),
    os: release(),
    cpu: cpus()[0]?.model,
    load: loadavg(),
  };
}
