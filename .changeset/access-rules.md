---
"relkit": minor
"@relkit/cli": minor
---

Functions accept an `access` rule — `roles`, `resource:action` `permissions` and an `allow` predicate over the session and input — that the engine checks before the handler for every caller: HTTP routes, jobs, tasks, event consumers, tools, agent tool calls, MCP and the runtime handle. A signed-in caller who fails it gets `access-denied` (403 over HTTP) and a caller without a session gets `unauthenticated` (401). Runtime-handle calls run as the `system` caller, which passes every rule, and `relkit.as(session)` returns a handle whose calls run as that user.
