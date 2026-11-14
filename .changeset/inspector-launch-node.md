---
"@relkit/inspector": patch
---

The Inspector now starts from either runtime. `npm run inspector` (the launcher on Node) used to stop at once with "verify launch options, private connection directory and persistent history mount", and `bun --bun run inspector` printed "Ready" and then answered 500 on every page because its interface ran on Bun. The interface and the history worker now run on a real Node.js: the running one when the launcher runs on Node, otherwise the first `node` on `PATH` that is not Bun's alias; the alias directories are removed from the children's `PATH`. When no Node.js of the supported release (>=20.9.0) is found, the Inspector stops with `ui.node-missing` or `ui.node-unsupported` and says what to install; a failed start of the interface names the Node.js executable it tried.
