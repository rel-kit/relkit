# @relkit/agents

Agents accept native LangChain models, tools, and middleware with finite execution limits. RelKit
function-backed tools preserve validation, authorization, and policy while participating in the same native
execution. Adding subagents, skills, memory files, or a backend selects DeepAgents behavior through the
same declaration.

```ts
import { defineAgent } from "@relkit/app/agents";
import { z } from "@relkit/app/schema";
import { FakeToolCallingModel, todoListMiddleware } from "langchain";
import lookupOrder from "./lookup-order.tool.js";

export default defineAgent({
  id: "orders.support-agent",
  input: z.object({ question: z.string().min(1) }),
  output: z.object({ answer: z.string() }),
  model: new FakeToolCallingModel(),
  instructions: "Answer order questions with the read-only lookup tool.",
  tools: [lookupOrder],
  middleware: [todoListMiddleware()],
  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 },
  stateProfile: "default",
  client: { public: true, state: ["todos"] },
});
```

Production applications install their LangChain model package and provide a compatible instance or lazy
factory from server code. Credentials and native provider instances never enter generated browser
contracts. Tests can use native fake models without network access or paid services.

Client-exposed agents require an agent-state profile. Every run, observation, control, and continuation
also requires an application-owned thread ID; RelKit never derives or invents that business identity.

Only allowlisted tools execute, and RELKIT approval remains authoritative. Runtime hooks expose safe
agent, model, and tool span metadata; prompts, results, secrets, and full tool content remain omitted
unless bounded development-redacted capture is selected.
