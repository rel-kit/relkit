---
"@relkit/inspector": patch
---

The Jobs pages no longer report "The jobs API is unavailable" for applications that define no jobs. Jobs routes are mounted only when an application declares jobs, so the inspector now shows "This application defines no jobs." on Definitions, Runs, Schedules and Services. A plain-text error reply keeps its HTTP status instead of being treated as invalid JSON, which also stops the burst of retried 404 requests.
