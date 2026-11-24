---
"@relkit/cli": patch
---

Fixed: `relkit start` prints `Server ready at <url>` once the built server passes its health
checks, and shows the server's own output and errors in the terminal instead of discarding them.
With `--json`, the ready result is one JSON line on stdout and the server's output goes to stderr.
