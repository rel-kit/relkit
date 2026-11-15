---
"@relkit/inspector": patch
---

The Inspector's pages refuse a request that is not addressed to the Inspector's own address, for reads as well as actions, so a page served from another name that resolves to this machine (DNS rebinding) cannot read inspection data or run an action. The accepted addresses are `127.0.0.1`, `localhost`, `[::1]` and the configured host, on the Inspector's port; with a wildcard bind (`0.0.0.0` or `::`) any IP address is accepted. An Inspector opened through another DNS name is refused: bind it to that name with `--hostname`.

An application outage reads "The application is unreachable. Retained history is intact." and no longer "history degraded". The route composer no longer offers cookie fields, which a browser never sent, and composer and action results say that they ran without a user session.
