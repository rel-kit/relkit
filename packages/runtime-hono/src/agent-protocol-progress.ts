import type { AgentProgressScope } from "@relkit/agents";
import type { ProgressFrame } from "./agent-protocol-progress.types.js";

/** Preserve tool scope metadata when constructing a progress frame.
 * @param partId - Stable progress part identifier.
 * @param value - Value to validate or project.
 * @param scope - Execution scope used to partition the operation.
 * @returns A tool-scoped frame or a frame explicitly scoped to the run.
 */
export function progressFrame(
  partId: string,
  value: unknown,
  scope: AgentProgressScope,
): ProgressFrame {
  const frame = { kind: "progress" as const, partId, value };
  return scope.scope === "tool" ? { ...frame, ...scope } : { ...frame, scope: "run" };
}
