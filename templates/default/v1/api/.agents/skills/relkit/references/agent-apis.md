# Agents, tools, and prompts

| API                                             | Import               | Role                                 |
| ----------------------------------------------- | -------------------- | ------------------------------------ |
| `defineAgent`, `defineGraph`, `defineGraphNode` | `@relkit/app/agents` | Model-driven agent or explicit graph |
| `defineTool`                                    | `@relkit/app/tools`  | Policy-controlled view of a function |
| `definePrompt`                                  | `@relkit/app`        | Reusable instructions                |
| `z`                                             | `@relkit/app/schema` | Agent and tool schemas               |

## `defineAgent`

Use `defineAgent` when a model should choose among tools. The agent template provides an executable offline LangChain model example. This shortened form uses the same public options:

```ts
import { defineAgent } from "@relkit/app/agents";
import { z } from "@relkit/app/schema";
import { FakeToolCallingModel } from "langchain";
import lookup from "@app/hello/tools/lookup.tool.js";
export default defineAgent({
  id: "hello.assistant",
  input: z.object({ message: z.string().min(1) }),
  output: z.object({ answer: z.string() }),
  model: new FakeToolCallingModel({
    toolCalls: [[{ name: "relkit_output", args: { value: { answer: "Hello!" } }, id: "output-1" }]],
  }),
  instructions: "Answer greeting questions with the available tools.",
  tools: [lookup],
  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 },
});
```

Other generated projects may need a native model package and application-owned provider configuration. `limits` requires positive `maxSteps`, `maxToolCalls`, and `timeoutMs`. `instructions` can be text or a `definePrompt` descriptor. A model can call only tools listed in the agent's `tools` array. A fixed sequence can be a function; a stateful explicit workflow can use `defineGraph` and `defineGraphNode`.

## `defineTool` and `definePrompt`

A RELKIT tool wraps a callable function without duplicating its schemas:

```ts
import { defineTool } from "@relkit/app/tools";
import lookup from "@app/orders/functions/lookup.function.js";
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
import { definePrompt } from "@relkit/app";
export default definePrompt("Answer using the available tools.", {
  id: "hello.assistant-instructions",
});
```

`lookup.asTool({ ... })` is the alternate tool form. Choose accurate `sideEffect` (`none`, `read`, `write`, or `external`) and `approval` (`never`, `on-write`, or `always`) policies. Tools are available to MCP by default; set `mcp: false` when a tool should remain inside the app. Permission checks belong in application logic.
If a browser client needs an agent, configure its explicit `client` contract. Keep provider credentials and native model instances on the server. A typed agent run uses a stable thread ID; resume the same thread instead of creating a replacement run.
