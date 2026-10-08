import { Effect } from "effect";
import { runCliEffect } from "../cli-runtime.js";
import { CliPortProbe, portProbeLayer } from "./port-availability.service.js";

/**
 * Checks availability using caller-supplied native probe authority.
 * @param port - Requested port, with zero preserving the no-probe behavior.
 * @param hostname - Interface to bind.
 * @param override - Flag used in occupied-port guidance.
 * @returns Lazy completion after scoped listener release.
 */
export const assertPortAvailableEffect = Effect.fn("Port.available")(
  (port: number, hostname: string, override: "--port" | "--inspector-port") =>
    CliPortProbe.use((probe) => probe.check(port, hostname, override)),
);

/**
 * Preserves the public native availability Promise boundary.
 * @param port - Requested port.
 * @param hostname - Interface to bind.
 * @param override - Flag used in occupied-port guidance.
 * @returns Completion after physical listener shutdown or the existing failure.
 */
export function assertPortAvailable(
  port: number,
  hostname: string,
  override: "--port" | "--inspector-port",
): Promise<void> {
  return runCliEffect(assertPortAvailableEffect(port, hostname, override), portProbeLayer);
}
