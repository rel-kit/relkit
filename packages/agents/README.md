# @zsys/agents

Agents use a logical model profile, declared tools, and finite execution
limits. Model credentials and clients belong to global provider configuration.

```ts
import { defineAgent } from "@zsys/agents";
import lookupOrder from "./lookup-order.tool";
import { z } from "@zsys/schema";

export default defineAgent({
  id: "orders.support-agent",
  input: z.object({ question: z.string().min(1) }),
  output: z.object({ answer: z.string() }),
  modelProfile: "default",
  instructions: "Answer order questions with the read-only lookup tool.",
  tools: [lookupOrder],
  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 },
});
```

Runtime hooks expose agent, model, and tool span metadata plus observed edges.
Prompt, instruction, result, secret, and full tool content are omitted unless
the caller explicitly selects `development-redacted` capture with a byte bound.
