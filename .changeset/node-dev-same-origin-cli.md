---
"@relkit/cli": patch
---

`relkit dev` run by Node now serves a same-origin `POST`, `PUT`, `PATCH` or `DELETE`. Node's
`fetch` replaces the `Host` header the development proxy forwards with the worker's private
address, so the worker judged every browser `Origin` as foreign and answered 403 `origin-denied`.
On Node the proxy now forwards over `node:http`, which keeps `Host`, as Bun's `fetch` already did.
Cross-origin requests are still denied, and forwarding headers sent by the client are not trusted.
