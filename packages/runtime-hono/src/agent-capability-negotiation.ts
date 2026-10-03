import { ORPCError } from "@orpc/server";
import {
  AGENT_CAPABILITY_HEADER,
  AGENT_CAPABILITY_QUERY,
  AGENT_STREAM_CAPABILITIES,
} from "@relkit/contracts";

/** Reject requests missing required native agent stream capabilities.
 * @param request - Incoming HTTP request.
 * @returns Nothing when every required capability is offered.
 */
export function assertAgentCapabilities(request: Request): void {
  const value =
    request.headers.get(AGENT_CAPABILITY_HEADER) ??
    new URL(request.url).searchParams.get(AGENT_CAPABILITY_QUERY) ??
    "";
  const offered = new Set(value.split(",").map((entry) => entry.trim()));
  const missing = AGENT_STREAM_CAPABILITIES.filter((capability) => !offered.has(capability));
  if (missing.length === 0) return;
  throw new ORPCError("AGENT_CAPABILITIES_UNSUPPORTED", {
    message: "The client does not support the required native agent stream capabilities.",
    data: { required: AGENT_STREAM_CAPABILITIES, missing },
  });
}
