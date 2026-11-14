---
"relkit": patch
---

The core graph probe `GET /_relkit/v1/graph` on the application port now returns only the
activation witness: graph and manifest hashes, the activation fingerprint, the generation id and
contract versions (D8). Functions, routes, source paths, permission names and environment
variable names are served only by the authenticated Inspector bridge. The application port no
longer serves an empty `/_relkit/v1/diagnostics` list when no diagnostics source is configured.
