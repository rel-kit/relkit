export const agentThreadIds = {
  support: "customer:demo:order:demo-1:support",
  deep: "customer:demo:order:demo-1:deep",
  review: "customer:demo:order:demo-1:review",
} as const;

export const agentTransports = ["sse", "websocket"] as const;
export type AgentTransport = (typeof agentTransports)[number];

export function interruptQuestion(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    value !== null &&
    typeof value === "object" &&
    "question" in value &&
    typeof value.question === "string"
  ) {
    return value.question;
  }
  return "Approve this order?";
}
