/**
 * Shared agent adapter conformance suite. Every first-party adapter runs the same cases: tools
 * through the engine, approvals, durable threads, AG-UI streaming, access rules, traces and model
 * profiles. A case rejects with a description of the first broken expectation.
 */
import { agUiEvents, modelToolName, type AgentAdapterFrame } from "relkit/agent-adapters";
import { conformanceRun, lookupTool, refundTool } from "./agents-conformance-fixture.js";
import type {
  AgentConformanceCase,
  AgentConformanceHarness,
  AgentConformanceOptions,
  AgentConformanceTurn,
} from "./agents-conformance.types.js";

export type * from "./agents-conformance.types.js";

/** The cases every adapter passes.*/
export const AGENT_CONFORMANCE_CASES: readonly AgentConformanceCase[] = Object.freeze([
  { id: "tools", description: "tool calls run through the common engine" },
  { id: "approvals", description: "an approval-required tool pauses the run and resumes" },
  { id: "threads", description: "a second run on a thread continues its conversation" },
  { id: "streaming", description: "runs stream AG-UI events in order" },
  { id: "access-rules", description: "the bridge calls the engine's access check before tools" },
  { id: "traces", description: "runs record run, model and tool spans" },
  { id: "model-profiles", description: "the model comes from the agent's model profile" },
]);

const lookup = modelToolName(lookupTool.id);
const refund = modelToolName(refundTool.id);
const call = (id: string, name: string, input: unknown) => ({ id, name, input });
const answer = (id: string, text: string): AgentConformanceTurn => ({
  toolCalls: [call(id, "relkit_output", { value: { answer: text } })],
});
const LOOKUP_SCRIPT = [
  { toolCalls: [call("call-1", lookup, { id: "o1" })] },
  answer("call-2", "shipped"),
];

/**
 * Creates the conformance harness for one adapter.
 * @param options - The adapter value factory, its runtime half and a scripted model builder.
 * @returns Cases and a runner.
 * @example
 * ```ts
 * import { createAgentAdapterRuntime, defineAgentRuntime } from "relkit/agent-adapters";
 * import { createAgentConformanceHarness } from "@relkit/testing/agents-conformance";
 *
 * const harness = createAgentConformanceHarness({
 *   adapter: () => defineAgentRuntime({ adapterId: "echo", integrationId: "echo", options: {} }),
 *   runtime: createAgentAdapterRuntime({
 *     adapterId: "echo",
 *     turn: async () => ({ text: "", toolCalls: [] }),
 *   }),
 *   scriptedModel: () => ({}),
 * });
 * // In a test file: for (const item of harness.cases) test(item.description, () => harness.run(item.id));
 * console.log(harness.cases.map((item) => item.id));
 * ```
 */
export function createAgentConformanceHarness(
  options: AgentConformanceOptions,
): AgentConformanceHarness {
  return Object.freeze({
    suite: "agents",
    cases: AGENT_CONFORMANCE_CASES,
    run: async (caseId: AgentConformanceCase["id"]) => {
      const check = CHECKS[caseId];
      if (check === undefined) throw new Error(`Unknown agent conformance case "${caseId}".`);
      await check(options);
    },
  });
}

const CHECKS: Record<
  AgentConformanceCase["id"],
  (options: AgentConformanceOptions) => Promise<void>
> = {
  tools: async (options) => {
    const run = conformanceRun(options, LOOKUP_SCRIPT);
    const result = await run.execution.run({ input: { message: "Where is o1?" }, threadId: "t1" });
    expect(result.status === "completed", "run completes", result);
    expect(
      same(result.status === "completed" && result.output, { answer: "shipped" }),
      "output",
      result,
    );
    expect(
      same(run.engineCalls, [{ functionId: "conformance.lookup-order", input: { id: "o1" } }]),
      "engine call",
      run.engineCalls,
    );
    const messages = run.threads.get("t1")?.messages ?? [];
    expect(
      messages.some((message) => message.role === "tool" && message.content.includes("shipped")),
      "tool result reaches the model",
      messages,
    );
  },
  approvals: async (options) => {
    const run = conformanceRun(options, [
      { toolCalls: [call("call-1", refund, { id: "o1" })] },
      answer("call-2", "refunded"),
    ]);
    const paused = await run.execution.run({ input: { message: "Refund o1" }, threadId: "t1" });
    expect(paused.status === "interrupted", "run pauses for approval", paused);
    expect(run.engineCalls.length === 0, "tool does not run before approval", run.engineCalls);
    const approval = paused.status === "interrupted" ? paused.approvals[0] : undefined;
    expect(approval?.toolId === refundTool.id, "approval names the tool", approval);
    const resumed = await run.execution.resume({
      threadId: "t1",
      decisions: { [approval!.toolCallId]: "approved" },
    });
    expect(resumed.status === "completed", "resume completes", resumed);
    expect(Number(run.engineCalls.length) === 1, "tool runs once after approval", run.engineCalls);
  },
  threads: async (options) => {
    const run = conformanceRun(options, [answer("call-1", "first"), answer("call-2", "second")]);
    await run.execution.run({ input: { message: "one" }, threadId: "t1" });
    const second = await run.execution.run({ input: { message: "two" }, threadId: "t1" });
    expect(second.status === "completed", "second run completes", second);
    const users = (run.threads.get("t1")?.messages ?? []).filter(
      (message) => message.role === "user",
    );
    expect(users.length === 2, "thread keeps both user messages", users);
  },
  streaming: async (options) => {
    const run = conformanceRun(options, LOOKUP_SCRIPT);
    const frames: AgentAdapterFrame[] = [];
    for await (const frame of run.execution.stream({ input: { message: "o1?" }, threadId: "t1" }))
      frames.push(frame);
    const types = frames.flatMap((frame) =>
      [...agUiEvents(frame)].map((event) => String(event.type)),
    );
    const expected = [
      "RUN_STARTED",
      "TOOL_CALL_START",
      "TOOL_CALL_END",
      "TOOL_CALL_RESULT",
      "RUN_FINISHED",
    ];
    expect(inOrder(types, expected), "AG-UI events in order", types);
  },
  "access-rules": async (options) => {
    const run = conformanceRun(options, LOOKUP_SCRIPT, () => ({
      allowed: false,
      code: "RELKIT_AGENT_ACCESS_DENIED",
      message: "Denied.",
    }));
    await run.execution.run({ input: { message: "o1?" }, threadId: "t1" });
    const request = run.accessRequests[0];
    expect(
      request?.source === "agent" && request.functionId === "conformance.lookup-order",
      "access check sees the agent call",
      run.accessRequests,
    );
    expect(run.engineCalls.length === 0, "denied tool does not reach the engine", run.engineCalls);
    const messages = run.threads.get("t1")?.messages ?? [];
    expect(
      messages.some(
        (message) =>
          message.role === "tool" && message.content.includes("RELKIT_AGENT_ACCESS_DENIED"),
      ),
      "denial reaches the model",
      messages,
    );
  },
  traces: async (options) => {
    const run = conformanceRun(options, LOOKUP_SCRIPT);
    await run.execution.run({ input: { message: "o1?" }, threadId: "t1" });
    const spans = run.spans.map((entry) => `${entry.span}:${entry.outcome}`);
    expect(
      same([...spans].sort(), [
        "agent.model:ok",
        "agent.model:ok",
        "agent.run:ok",
        "agent.tool:ok",
      ]),
      "spans",
      spans,
    );
  },
  "model-profiles": async (options) => {
    const run = conformanceRun(options, [answer("call-1", "ok")]);
    await run.execution.run({ input: { message: "hi" }, threadId: "t1" });
    expect(
      same(run.resolvedProfiles, ["default"]),
      "model resolved from the agent's profile",
      run.resolvedProfiles,
    );
  },
};

function expect(condition: boolean, label: string, actual: unknown): asserts condition {
  if (!condition)
    throw new Error(`Agent conformance failed: ${label}. Got ${JSON.stringify(actual)}`);
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function inOrder(values: readonly string[], expected: readonly string[]): boolean {
  let index = 0;
  for (const value of values) if (value === expected[index]) index += 1;
  return index === expected.length;
}
