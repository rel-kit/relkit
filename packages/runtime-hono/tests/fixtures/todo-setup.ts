import type { AgentExecutionEvent } from "@relkit/agents";
import type { RegistrationPlan } from "@relkit/graph";
import type { RuntimeManifest } from "../../src/index.ts";
import { runtimeCohort } from "../test-cohort.ts";
const pending = [
  { content: "Find the order", status: "in_progress" },
  { content: "Explain its state", status: "pending" },
] as const;
const progressing = [
  { content: "Find the order", status: "completed" },
  { content: "Explain its state", status: "in_progress" },
] as const;
const completed = [
  { content: "Find the order", status: "completed" },
  { content: "Explain its state", status: "completed" },
] as const;
export const expectedStates = [pending, progressing, completed] as const;
export function expectedStateIndex(event: AgentExecutionEvent): number {
  if (event.kind !== "values" || event.scope.length !== 0 || !isRecord(event.value)) return -1;
  const value = event.value;
  return expectedStates.findIndex((state) => JSON.stringify(state) === JSON.stringify(value.todos));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function agentPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:native-todo-network",
    functions: [],
    httpTriggers: [],
    queues: [],
    schedules: [],
    eventTriggers: [],
    buckets: [],
    caches: [],
    tools: [],
    channels: [],
    agents: [
      {
        kind: "agent",
        id: "support.echo",
        source: { file: "agent.ts", line: 1, column: 1 },
        input: {},
        output: {},
        instructions: "redacted",
        toolIds: [],
        limits: {},
        generatedFunction: {
          functionId: "relkit.agent.support.echo.invoke",
          generated: true,
          generatedBy: "agent",
          agentId: "support.echo",
        },
        profile: "default",
        stateProfile: "default",
        client: "protected",
        chat: { input: "message", output: "answer" },
        controls: [],
      },
    ],
    middlewares: [],
  };
}

export function manifest(plan: RegistrationPlan, agent: unknown): RuntimeManifest {
  return {
    ...runtimeCohort(plan.graphHash),
    functions: {},
    agents: { "support.echo": agent },
    middleware: {},
    requestTransforms: {},
  };
}
