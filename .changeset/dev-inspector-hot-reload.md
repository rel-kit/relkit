---
"@relkit/cli": patch
---

`relkit dev` now applies `inspector.enabled` and `inspector.connection` changes on reload. Enabling inspection starts the session bridge, telemetry capture and discovery descriptor once the rebuilt generation is serving, so an already-running standalone Inspector connects without restarting `relkit dev`; disabling it stops the bridge and closes the telemetry ingress once the previous generation has drained, and a connection change rebinds the bridge. Re-enabling keeps recording history under the same session, and a bridge that failed to start is retried on the next reload.
