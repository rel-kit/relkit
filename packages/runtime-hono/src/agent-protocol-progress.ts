import type { AgentProgressScope } from "@relkit/agents";
import type { AgentProtocolFrame } from "./agent-protocol-stream.js";

type ProgressFrame = Extract<AgentProtocolFrame, { kind: "progress" }>;

export function progressFrame(
  partId: string,
  value: unknown,
  scope: AgentProgressScope,
): ProgressFrame {
  const frame = { kind: "progress" as const, partId, value };
  return scope.scope === "tool" ? { ...frame, ...scope } : { ...frame, scope: "run" };
}
