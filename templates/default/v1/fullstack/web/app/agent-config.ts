export const agentThreadIds = {
  assistant: "demo:assistant",
  review: "demo:review",
} as const;

export const agentTransports = ["sse", "websocket"] as const;
export type AgentTransport = (typeof agentTransports)[number];
