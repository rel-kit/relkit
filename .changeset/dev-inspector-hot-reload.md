---
"@relkit/cli": patch
---

`relkit dev` now applies `inspector.enabled` and `inspector.connection` changes on reload. Enabling inspection starts the session bridge, telemetry capture and discovery descriptor once the rebuilt generation is serving, so an already-running standalone Inspector connects without restarting `relkit dev`; disabling it stops the bridge and releases capture, and a connection change rebinds the bridge.
