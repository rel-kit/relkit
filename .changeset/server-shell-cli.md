---
"@relkit/cli": patch
---

`relkit start` now runs the built server in production mode by default (D9): it sets
`RELKIT_ENV=production` unless you set `RELKIT_ENV` yourself, so a started build no longer
exposes the API reference and the activation probe when `NODE_ENV` is unset. Set
`RELKIT_ENV=development` to keep the previous behaviour.
