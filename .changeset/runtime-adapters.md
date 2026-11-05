---
"relkit": minor
"@relkit/cli": minor
---

Breaking: Serving, static files, WebSocket upgrades, hashing and environment access go through a runtime adapter. `relkit/runtime` defines the adapter contract and picks the adapter for the runtime the process runs on; `relkit/runtime/bun` and `relkit/runtime/node` are the Bun and Node adapters. `relkit/runtime-hono/bun` is removed; import `upgradeWebSocket` from `relkit/runtime/bun` instead. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9).
