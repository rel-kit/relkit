import type { AgentProtocolFrame } from "./agent-protocol-stream.js";

/** Progress frame retaining either run scope or explicit tool-call identity. */
export type ProgressFrame = Extract<AgentProtocolFrame, { kind: "progress" }>;
