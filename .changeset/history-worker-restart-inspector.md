---
"@relkit/inspector": patch
---

When the Inspector's history worker stops on its own, the Inspector says so at once and starts a new one. Before, a worker that died while no record arrived went unnoticed: `/_relkit/v1/storage` kept answering `state: ready` and `collection: collecting`. Now it answers `state: degraded`, `collection: history-unavailable` and `error: history.worker-exited` from the moment the worker stops; the Inspector starts a new worker after about a second (three quick tries, then every 30 seconds), and the status is `ready` again as soon as it runs, without the application session changing. Records the application sent meanwhile stay in its inspection buffer until they are stored.
