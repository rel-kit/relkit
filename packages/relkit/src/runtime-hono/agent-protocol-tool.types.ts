import type { BrowserMessage } from "../agents/index.js";
import type { AgentProtocolFrame } from "./agent-protocol-stream.js";

/** Public tool frame containing lifecycle phase and incremental input metadata. */
export type ToolFrame = Extract<AgentProtocolFrame, { kind: "tool" }>;

/** Persisted browser-message tool part used to recover stream state. */
export type ToolPart = Extract<BrowserMessage["parts"][number], { kind: "tool" }>;
