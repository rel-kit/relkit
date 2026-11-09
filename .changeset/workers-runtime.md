---
"relkit": minor
"@relkit/cli": minor
---

`relkit build --runtime workers` builds a Cloudflare Workers bundle: `.relkit/build/server/index.js` exports a `fetch` handler that activates the server once per isolate without a listener, and includes every dependency. The new `relkit/runtime/workers` adapter has no listener, filesystem or child processes; Workers need the `nodejs_compat` compatibility flag, and `public/` is served by Workers static assets. `relkit start` refuses a Workers build.
