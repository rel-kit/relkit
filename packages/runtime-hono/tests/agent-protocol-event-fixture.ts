/** Supplies deterministic native execution events for AG-UI replay projection tests without acquiring providers or running agents. */
import type { AgentExecutionEvent } from "@relkit/agents";

/** Supplies the original root, nested-task and custom native event sequence.
 * @returns Three deterministic execution events preserving their native ordering.
 */
export function canonicalEvents(): readonly AgentExecutionEvent[] {
  const occurredAt = "2026-01-01T00:00:00.000Z";
  return [
    {
      nativeSequence: 1,
      kind: "values",
      scope: [],
      occurredAt,
      value: { todos: [{ content: "Inspect", status: "in_progress" }] },
    },
    {
      nativeSequence: 2,
      kind: "tasks",
      scope: ["tools:delegate"],
      occurredAt,
      agent: "researcher",
      parent: { kind: "tool", toolCallId: "delegate-1", toolId: "task" },
      value: { id: "child-task", name: "research", status: "started" },
    },
    {
      nativeSequence: 3,
      kind: "custom",
      scope: [],
      occurredAt,
      value: { name: "orders.notice", status: "ready" },
    },
  ];
}
