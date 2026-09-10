import { ORPCError } from "@orpc/server";
import {
  AGENT_CAPABILITY_HEADER,
  AGENT_CAPABILITY_QUERY,
  AGENT_STREAM_CAPABILITIES,
} from "@relkit/contracts";

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
