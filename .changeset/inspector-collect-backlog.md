---
"@relkit/inspector": patch
---

Fixed: the Inspector collects a backlog without pausing between full batches, and its "inspection
is incomplete" diagnostic names what the application's buffer gave up (for example "120 framework
success logs, 3 other logs").
