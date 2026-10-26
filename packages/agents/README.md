# @relkit/agents

Generic agent declarations, public client events and durable state contracts do not install or evaluate an agent SDK. Applications can use `defineAgent` from `@relkit/app/agents` with RELKIT tool references and a model selector:

```ts
import { defineAgent } from "@relkit/app/agents";
import { z } from "@relkit/app/schema";

export const assistant = defineAgent({
  input: z.object({ message: z.string() }),
  output: z.object({ answer: z.string() }),
  model: "test:default",
  instructions: "Answer briefly.",
  tools: [],
  limits: { maxSteps: 4, maxToolCalls: 2, timeoutMs: 10_000 },
});
```

Selected agents execute through the explicitly installed [@relkit/langchain](../../integrations/packages/langchain/README.md) integration. Import native models, middleware, tools, graph authoring, persistence resources and execution helpers there. Generic declarations preserve schema and RELKIT tool tuple inference; native middleware and graph state inference remain in the native facade.

State-provider interfaces, requests, receipts and stored state live below execution implementations in `@relkit/contracts`. Local and Redis state providers preserve their existing durable identities and storage versions without depending on an execution SDK.
