# @relkit/ai-sdk

> Labs: the agent adapter interface may change before it is declared stable.

The Vercel AI SDK adapter for RelKit agents. Install it only in applications that select it:

```sh
bun add @relkit/ai-sdk ai
```

```ts
import { aiSdk } from "@relkit/ai-sdk";
import { defineAgent } from "relkit/agents";
import { z } from "relkit/schema";

export default defineAgent({
  id: "support",
  runtime: aiSdk(),
  model: "default",
  input: z.object({ message: z.string() }),
  output: z.object({ answer: z.string() }),
  instructions: "Answer briefly.",
  tools: [],
  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 30_000 },
});
```

RelKit owns tool calls, approvals, threads, AG-UI streaming and traces; the adapter only runs model
turns with `generateText`. Applications whose agents use `langchain()` install no AI SDK package.
