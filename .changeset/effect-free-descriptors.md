---
"relkit": minor
---

Breaking: Tool descriptors and function graph nodes no longer have an `invokeEffect` member, so their types carry no Effect types. Call `callToolEffect(tool, input)` or `callGraphNodeEffect(node, input)` from `relkit/effect` instead; `invoke` is unchanged. `InspectorConfig` is now a plain interface. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9).
