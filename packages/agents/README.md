# @relkit/agents

Agents use an optional serializable model selector, declared tools, and finite
execution limits. Model credentials and live clients belong to per-environment
provider configuration, not agent descriptors.

```ts
import { defineAgent } from "@relkit/app/agents";
import lookupOrder from "./lookup-order.tool";
import { z } from "@relkit/app/schema";

export default defineAgent({
  id: "orders.support-agent",
  input: z.object({ question: z.string().min(1) }),
  output: z.object({ answer: z.string() }),
  model: "openai:gpt-5-mini",
  instructions: "Answer order questions with the read-only lookup tool.",
  tools: [lookupOrder],
  limits: { maxSteps: 4, maxToolCalls: 4, timeoutMs: 10_000 },
});
```

Configure model defaults on the active provider set:

```ts
modelProviders: {
  defaultProvider: "openai",
  defaultModel: "gpt-5-mini",
  openai: { apiKey: env.OPENAI_API_KEY },
  anthropic: { defaultModel: "claude-sonnet-4-5", apiKey: env.ANTHROPIC_API_KEY },
}
```

An omitted `model` uses both defaults, a provider name selects that provider's
default model, and `provider:model` selects an exact AI SDK v7 registry model.
Development and test runs can use the `ai/test`-backed harness without network
calls. Only allowlisted tools execute, and RELKIT approval remains authoritative.

Runtime hooks expose agent, model, and tool span metadata plus observed edges.
Prompt, instruction, result, secret, and full tool content are omitted unless
the caller explicitly selects `development-redacted` capture with a byte bound.
