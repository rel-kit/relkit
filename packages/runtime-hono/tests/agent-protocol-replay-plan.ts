/** Supplies the unchanged checked graph cohort for AG-UI replay fixtures. */
import type { RegistrationPlan } from "@relkit/graph";
/** Builds the original protected, client-exposed echo-agent graph.
 * @returns Checked graph cohort retaining original stable operation IDs.
 */
export function agentProtocolReplayPlan(): RegistrationPlan {
  return {
    graphHash: "sha256:agent-protocol-replay",
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
      },
    ],
    middlewares: [],
  };
}
