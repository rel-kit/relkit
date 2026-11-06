---
"@relkit/cli": minor
---

`relkit build --runtime node` builds the production server for Node: the bundle targets Node, the server listens through the Node runtime adapter, `manifest.json` records `"runtime": "node"`, and the Dockerfile installs production dependencies with Bun and runs `node server/index.js` on a pinned `node:24` image. `relkit build` without the option still builds for Bun.
