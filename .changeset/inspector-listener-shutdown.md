---
"@relkit/inspector-api": patch
"@relkit/inspector": patch
---

Stopping the inspector no longer hangs when a browser is attached. Bun can leave a forced listener stop unconfirmed when a peer was killed mid-stream (the UI holding a browser's live feed), and the inspector waited on it forever, leaving the process running after Ctrl+C, `kill` or a closed terminal. Listener retirement now waits at most two seconds for that confirmation, logs a warning, and finishes shutting down.
