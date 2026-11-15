---
"relkit": patch
---

`RuntimeSpawnOptions` of the runtime adapter (`relkit/runtime`) gains `processGroup`: on POSIX the
child starts as the leader of its own process group, so `process.kill(-pid, signal)` reaches the
child and everything it started. Bun and Node implement it with `detached`; Windows ignores it.
