/**
 * Compares accepted generation inspector policy with the session's startup bridge policy.
 * The bridge, session token and capture ingress are session-owned, so a reload cannot
 * apply a changed policy; the session reports an explicit restart requirement instead.
 */
import type { InspectorConfiguration } from "@relkit/contracts";
import type { DevelopmentPorts } from "./dev-inspector.types.js";

/**
 * Describes why an accepted generation's inspector policy needs a restart.
 * @param startup - Bridge policy captured when the dev session started.
 * @param next - Inspector configuration from the accepted generation.
 * @returns A restart instruction, or undefined when the running bridge already matches.
 */
export function inspectorRestartNotice(
  startup: DevelopmentPorts["inspector"],
  next: InspectorConfiguration,
): string | undefined {
  if (!next.enabled)
    return startup === false
      ? undefined
      : "inspector.enabled is now false, but the inspection bridge started with this session keeps running. Restart relkit dev to stop it.";
  if (startup === false)
    return "inspector.enabled is now true, but the inspection bridge only starts with relkit dev. Restart relkit dev to connect the Inspector.";
  if (startup.host === next.connection.host && startup.port === next.connection.port)
    return undefined;
  return "inspector.connection changed, but the inspection bridge keeps its startup address. Restart relkit dev to apply it.";
}
