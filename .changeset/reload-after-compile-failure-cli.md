---
"@relkit/cli": patch
---

`relkit dev` reports a save that does not parse, or a module that throws while it loads, at once
instead of after a 10-second timeout, and a fix saved meanwhile is live right after. The failure
is one error block: `Reload failed; previous version is still serving` followed by the cause. When
the new process exits while it starts (a configuration or module that fails only in the served
process), the block shows what the process wrote, with the file and line, instead of the startup
lines as warnings and `RELKIT_CANDIDATE_HEALTH_TIMEOUT`.

The `dev.generation.active`, `dev.generation.swapped` and `dev.generation.failed` events carry
`runId`, one identifier per `relkit dev` process, and `reason`: `start` for the first generation
of a run, `reload` for handlers swapped in the serving process, `restart` for a new process. A
generation history can now tell a restart of the command from a reload.

A development generation started with a custom candidate host (`candidateHostname`) now binds
that host: the host the supervisor allocated the port on is passed to the generated server.
