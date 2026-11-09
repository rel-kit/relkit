/** Checks the agent adapter interface and `defineAgent`'s `runtime` and model profile typing. */
import { aiSdk } from "@relkit/ai-sdk";
import { langchain } from "@relkit/langchain";
import { todoListMiddleware } from "langchain";
import { defineAgent } from "relkit/agents";
import {
  defineAgentRuntime,
  type AgentAdapterExecution,
  type AgentAdapterRuntime,
  type AgentRunResult,
  type AgentRuntimeAdapter,
  type AgentRuntimeReference,
  type AgentToolBridge,
  type AgentToolOutcome,
} from "relkit/agent-adapters";
import { z } from "relkit/schema";

const portable = {
  input: z.object({ message: z.string() }),
  output: z.object({ answer: z.string() }),
  instructions: "Answer.",
  tools: [],
  limits: { maxSteps: 2, maxToolCalls: 2, timeoutMs: 1_000 },
} as const;

// The adapter value keeps its literal identity and options.
const echo = defineAgentRuntime({ adapterId: "echo", integrationId: "echo", options: { x: 1 } });
const echoId: "echo" = echo.adapterId;
const echoOptions: { x: number } = echo.options;
const reference: AgentRuntimeReference = echo;
void [echoId, echoOptions, reference];

// The execution contract: run, stream, resume and stop.
declare const runtime: AgentAdapterRuntime<"echo">;
declare const bridge: AgentToolBridge;
const execution: AgentAdapterExecution = runtime.execution({
  agent: {
    id: "a",
    instructions: "",
    output: portable.output,
    limits: portable.limits,
    runtime: reference,
  },
  models: { resolve: () => ({ id: "test:model", profile: "default", model: {} }) },
  tools: bridge,
  state: { load: () => undefined, save: () => undefined },
});
const run: Promise<AgentRunResult> = execution.run({ input: {}, threadId: "t" });
const resumed: Promise<AgentRunResult> = execution.resume({
  threadId: "t",
  decisions: { call: "approved" },
});
// @ts-expect-error Decisions are "approved" or "denied".
void execution.resume({ threadId: "t", decisions: { call: "maybe" } });
const stopped: Promise<void> = execution.stop("run");
void [run, resumed, stopped, execution.stream({ input: {}, threadId: "t" })];
declare const outcome: AgentToolOutcome;
if (outcome.status === "approval-required") {
  const toolId: string = outcome.approval.toolId;
  void toolId;
}

// defineAgent takes a runtime adapter and a model profile name.
const agent = defineAgent({
  id: "types.portable",
  runtime: langchain(),
  model: "default",
  ...portable,
});
const adapterId: "langchain" = agent.runtime.adapterId;
void adapterId;
// The same agent swaps adapters without other edits.
const swapped = defineAgent({
  id: "types.swapped",
  runtime: aiSdk(),
  model: "default",
  ...portable,
});
const swappedId: "ai-sdk" = swapped.runtime.adapterId;
void swappedId;

// @ts-expect-error Agents require a runtime adapter.
defineAgent({ id: "types.no-runtime", ...portable });
// @ts-expect-error Native models go in the adapter's options; `model` names a profile.
defineAgent({ id: "types.native-model", runtime: aiSdk(), model: {}, ...portable });
// @ts-expect-error Middleware is a LangChain option, not a portable field.
defineAgent({ id: "types.middleware", runtime: langchain(), middleware: [], ...portable });

// LangChain middleware exposes its state keys to the client policy only under LangChain.
const tied = defineAgent({
  id: "types.tied",
  runtime: langchain({ middleware: [todoListMiddleware()] }),
  ...portable,
  stateProfile: "default",
  client: { public: true, state: ["todos"] },
});
const middleware: readonly [ReturnType<typeof todoListMiddleware>] = tied.middleware;
void middleware;
defineAgent({
  id: "types.untied",
  runtime: aiSdk(),
  ...portable,
  stateProfile: "default",
  // @ts-expect-error The AI SDK adapter exposes no middleware state.
  client: { public: true, state: ["todos"] },
});

type LangchainValue = ReturnType<typeof langchain>;
const value: AgentRuntimeAdapter<"langchain", unknown, object, string> = {} as LangchainValue;
void value;
