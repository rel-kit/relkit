---
"@relkit/schema": patch
"@relkit/contracts": patch
"@relkit/compiler": patch
"@relkit/functions": patch
"@relkit/services": patch
"@relkit/events": patch
"@relkit/jobs": patch
"@relkit/cache": patch
"@relkit/realtime": patch
"@relkit/routes": patch
"@relkit/runtime-hono": patch
"@relkit/tools": patch
"@relkit/agents": patch
"@relkit/testing": patch
"@relkit/langchain": patch
"@relkit/cli": patch
"create-relkit": patch
---

New: Function, event, task, error and agent contracts accept ArkType, Valibot (with `@valibot/to-json-schema`) and Effect Schema alongside Zod 4, new projects use Zod 4, and the installed schema library versions are part of the build fingerprint. [Supported libraries](https://relkit.dev/docs/learn/concepts/schemas#choose-a-schema-library)
