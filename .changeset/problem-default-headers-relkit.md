---
"relkit": patch
---

Every Problem Details response carries `X-Content-Type-Options: nosniff` and `Cache-Control: no-store`, including the ones the framework sends before a route runs: the 404 of an unmatched path, the 405 of a wrong method and the 413 of a body over the limit. `problemResponse` sets both headers, so a Problem built anywhere in the framework has them and a response that sets its own `Cache-Control` keeps it.
