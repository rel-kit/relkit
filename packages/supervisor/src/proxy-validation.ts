import { validateSupervisorToken } from "./state-machine-telemetry.js";
import type { SupervisorCandidateToken } from "./state-machine.types.js";
import type { ActiveSupervisorProxyTarget, SupervisorProxyTarget } from "./proxy.types.js";

/** Validates a native listener port. @param port - Requested port. @param allowZero - Ephemeral policy.
 * @returns The admitted port; throws the established RangeError on invalid input.
 */
export function validatePort(port: number, allowZero: boolean): number {
  if (!Number.isSafeInteger(port) || port < (allowZero ? 0 : 1) || port > 65_535)
    throw new RangeError("Supervisor proxy ports must be between 1 and 65535.");
  return port;
}

/** Validates an authority host. @param hostname - Host without scheme or port. @param name - Field label. */
export function validateHostname(hostname: string, name: string): void {
  if (hostname.trim() === "" || /[\s/:]/.test(hostname))
    throw new TypeError(`Supervisor proxy ${name} must be a hostname.`);
}

/** Copies a generation target before admission. @param target - Requested generation.
 * @param defaultHostname - Private child host. @returns An immutable validated reference.
 */
export function normalizeTarget(
  target: SupervisorProxyTarget,
  defaultHostname: string,
): ActiveSupervisorProxyTarget {
  validateSupervisorToken(target.token);
  const port = validatePort(target.port, false);
  const hostname = target.hostname ?? defaultHostname;
  validateHostname(hostname, "target hostname");
  return Object.freeze({ token: Object.freeze({ ...target.token }), hostname, port });
}

/** Compares generation identities. @param current - Current reference. @param expected - CAS witness.
 * @returns Whether both revisions match, including two missing references.
 */
export function sameToken(
  current: SupervisorCandidateToken | undefined,
  expected: SupervisorCandidateToken | undefined,
): boolean {
  return current === undefined
    ? expected === undefined
    : expected !== undefined &&
        current.sourceToken === expected.sourceToken &&
        current.generationToken === expected.generationToken;
}
