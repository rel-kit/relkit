---
"relkit": minor
"@relkit/cli": minor
---

Breaking: `defineError` requires an `id`, because an error's ID is its public `code` in API responses and must not change when a file moves. `relkit check` reports `RELKIT_ERROR_ID_REQUIRED` at each error declared without one and suggests the ID earlier versions inferred, so adding it keeps the current public code. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#error-ids).
