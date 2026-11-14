---
"@relkit/cli": patch
---

A development generation started with a custom candidate host (`candidateHostname`) now binds
that host: the host the supervisor allocated the port on is passed to the generated server.
