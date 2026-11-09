---
"relkit": minor
"@relkit/cli": minor
---

New: A function handler may throw its declared errors as well as return them, and no longer has to raise every error in its `errors` list. Set `check: { unusedErrors: true }` in `defineApp` to have `relkit check` warn about a declared error a handler never raises.
