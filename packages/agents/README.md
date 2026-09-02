# @relkit/agents

Agents use a serializable model selector, declared tools, and finite execution limits. Model credentials
and live clients belong to application model bindings, not agent descriptors.

```ts
import { defineAgent } from "@relkit/app/agents";
import { z } from "@relkit/app/schema";
import lookupOrder from "./lookup-order.tool.js";

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

Configure the selected AI SDK profile in `relkit.config.ts`:

```ts
import { aiSdk } from "@relkit/ai-sdk";
import { defineApp, defineEnv, env as binding } from "@relkit/app/config";

export default defineApp({
  env: defineEnv({}),
  model: {
    openai: aiSdk({
      provider: "openai",
      defaultModel: "gpt-5-mini",
      apiKey: binding.secret("OPENAI_API_KEY"),
    }),
  },
  defaults: { model: "openai" },
});
```

An omitted agent model uses the default profile and model. A profile name uses that profile's default;
`profile:model` selects an exact model. Tests must supply scripted model replacements explicitly, so
offline runs never acquire a model key or make a network call by environment convention.

Only allowlisted tools execute, and RELKIT approval remains authoritative. Runtime hooks expose safe
agent, model, and tool span metadata; prompts, results, secrets, and full tool content remain omitted
unless bounded development-redacted capture is selected.
