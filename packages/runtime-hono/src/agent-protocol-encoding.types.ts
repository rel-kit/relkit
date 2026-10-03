import type { AgentProtocolFrame } from "./agent-protocol-stream.js";

/** Tool-call frame accepted by the AG-UI encoding adapter. */
export type ToolFrame = Extract<AgentProtocolFrame, { kind: "tool" }>;
