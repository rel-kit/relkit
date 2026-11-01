---
"@relkit/inspector-api": patch
"@relkit/inspector": patch
"@relkit/observability": patch
---

Two Inspectors connected to the same `relkit dev` session no longer lose each other's records. Each Inspector now identifies itself when it collects, and the session only discards records that every Inspector still collecting has saved; an Inspector that stops collecting for 30 seconds no longer holds records back. Previously, whichever Inspector confirmed a batch first discarded it for both, so the other one's request, trace and log history silently missed requests. When an Inspector does miss records, it now saves an "Inspection is incomplete" diagnostic naming the skipped range instead of losing them silently. The early-retention status also reports the latest admitted `sequence`.
