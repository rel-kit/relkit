---
"@relkit/cli": patch
---

`relkit dev` now warns when an accepted reload changes `inspector.enabled` or `inspector.connection`, explaining that the session-owned inspection bridge needs a `relkit dev` restart instead of reporting a silent successful reload.
