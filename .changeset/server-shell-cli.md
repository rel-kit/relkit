---
"@relkit/cli": patch
---

`relkit start` now runs the built server in production mode by default (D9): it sets
`RELKIT_ENV=production` unless you set `RELKIT_ENV` yourself, so a started build no longer
exposes the API reference and the activation probe when `NODE_ENV` is unset. Set
`RELKIT_ENV=development` to keep the previous behaviour.

The generated server no longer passes the compiled graph to the application-port graph probe,
which now carries identity only (D8). In production its `health/live` and `health/ready`
answer status and readiness only; the generation identity stays in development, where the
supervisor reads it.

The development worker started by `relkit dev` listens only on the loopback host its port was
allocated on, instead of every interface. Built servers started with `relkit start` or in a
container still listen on all interfaces.

The development front answers blocked inspection paths with a Problem Details 404 and an
`x-request-id`. The development log records client errors at info, except 401, 403 and 429 at
warn, keeps a request's status and duration on its line, and no longer cuts long names in the
middle.
