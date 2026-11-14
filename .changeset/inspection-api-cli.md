---
"@relkit/cli": patch
---

A generated server now forwards the originating request and the link to the publishing span when it runs an event reaction, so a request that publishes an event lists the reaction as a continuation in the Inspector.
