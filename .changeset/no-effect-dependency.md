---
"relkit": minor
"@relkit/cli": minor
"create-relkit": minor
---

New: Applications no longer need `effect` as a direct dependency. The generated `runtime-integrations.ts` checks and loads integrations through Promise APIs in `relkit/host`, and new projects from `create-relkit` no longer list `effect`. An existing project can remove `effect` from its `package.json` unless its own code imports it.
