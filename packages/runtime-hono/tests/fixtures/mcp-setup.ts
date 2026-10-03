import type { RegistrationPlan, ToolRegistration } from "@relkit/graph";
import { z } from "@relkit/schema";
const source = { file: "src/tools.ts", line: 1, column: 1 };
export const input = z.object({ value: z.string() });
export const output = z.object({ echoed: z.string() });

export function tool(
  id: string,
  mcp: boolean,
  approval: ToolRegistration["approval"],
): ToolRegistration {
  return {
    kind: "tool",
    id,
    source,
    targetFunctionId: `${id}.function`,
    description: `${id} tool`,
    sideEffect: "read",
    approval,
    mcp,
  };
}

export function toolPlan(tools: readonly ToolRegistration[]): RegistrationPlan {
  return {
    graphHash: "sha256:mcp",
    functions: [],
    httpTriggers: [],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools,
    agents: [],
    channels: [],
    middlewares: [],
  };
}
