---
"@relkit/ai-sdk": minor
---

`aiSdk({ … })` is the Vercel AI SDK agent adapter for `defineAgent({ runtime })`: declaring an agent loads nothing from the AI SDK, and the generated server imports the adapter's runtime entry only for agents that select it. The adapter runs the shared agent conformance suite from `@relkit/testing/agents-conformance`.
