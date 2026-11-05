---
"relkit": minor
"@relkit/langchain": minor
---

Breaking: `defineAgent` from `@relkit/langchain` is removed. Define agents with `defineAgent` from `relkit/agents` and select LangChain with `runtime: langchain({ … })`, which holds LangChain's own model instances, tools, middleware and persistence options; a string `model` names a model profile. `relkit migrate` moves those options into `langchain({ … })`. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#agent-runtime).
