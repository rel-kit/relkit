# Agents, tools, and prompts

| API                              | Import              | Role                                        |
| -------------------------------- | ------------------- | ------------------------------------------- |
| `defineAgent`                    | `relkit/agents`     | Agent declaration with a `runtime` adapter  |
| `langchain`, `langchainModel`    | `@relkit/langchain` | LangChain adapter (Labs) and model profiles |
| `defineGraph`, `defineGraphNode` | `@relkit/langchain` | Native LangGraph workflow (Labs)            |
| `aiSdk`                          | `@relkit/ai-sdk`    | Optional Vercel AI SDK adapter (Labs)       |
| `defineTool`                     | `relkit/tools`      | Policy-controlled view of a function        |
| `definePrompt`                   | `relkit`            | Reusable instructions                       |
| `z`                              | `zod`               | Agent and tool schemas                      |

The native integration requires application-installed `@langchain/core`, `@langchain/langgraph`, `langchain` and `langsmith` at the supported versions. Add `deepagents` only for a deep-agent declaration. Check/build/start validate selected requirements before readiness; they do not install missing peers. Every agent selects its adapter with `runtime`; LangChain-native models, tools, middleware and persistence go in `langchain({ ... })`, and `model` names a model profile bound in `relkit.config.ts`. Apps that never select `aiSdk()` install no AI SDK package.

## `defineAgent`

Use `defineAgent` when a model should choose among tools. The agent template provides an executable offline LangChain model example. This shortened form uses the same public options:

```ts
import { defineAgent } from "relkit/agents";
import { langchain } from "@relkit/langchain";
import { z } from "zod";
import { FakeToolCallingModel } from "langchain";
import lookup from "@app/services/hello/tools/lookup.tool.js";
export default defineAgent({
  id: "hello.assistant",
  runtime: langchain({
    model: new FakeToolCallingModel({
      toolCalls: [
        [{ name: "relkit_output", args: { value: { answer: "Hello!" } }, id: "output-1" }],
      ],
    }),
  }),
  input: z.object({ message: z.string().min(1) }),
  output: z.object({ answer: z.string() }),
  instructions: "Answer greeting questions with the available tools.",
  tools: [lookup],
  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 },
});
```

Other generated projects bind a model profile instead, such as `model: { default: langchainModel({ model: "openai:gpt-5" }) }` in `relkit.config.ts`, and install that provider's package. `limits` requires positive `maxSteps`, `maxToolCalls`, and `timeoutMs`. `instructions` can be text or a `definePrompt` descriptor. A model can call only tools listed in the agent's `tools` array. A fixed sequence can be a function; a stateful explicit workflow can use `defineGraph` and `defineGraphNode`.

## `defineTool` and `definePrompt`

A RelKit tool wraps a callable function without duplicating its schemas:

```ts
import { defineTool } from "relkit/tools";
import lookup from "@app/services/orders/functions/lookup.function.js";
export default defineTool({
  id: "orders.lookup",
  target: lookup,
  description: "Look up an order by ID",
  sideEffect: "read",
  approval: "never",
  timeoutMs: 2_000,
});
```

```ts
import { definePrompt } from "relkit";
export default definePrompt("Answer using the available tools.", {
  id: "hello.assistant-instructions",
});
```

`lookup.asTool({ ... })` is the alternate tool form. Choose accurate `sideEffect` (`none`, `read`, `write`, or `external`) and `approval` (`never`, `on-write`, or `always`) policies. Tools are available to MCP by default; set `mcp: false` when a tool should remain inside the app. Permission checks belong in application logic.
If a browser client needs an agent, configure its explicit `client` contract. Keep provider credentials and native model instances on the server. A typed agent run uses a stable thread ID; resume the same thread instead of creating a replacement run.
