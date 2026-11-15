---
"@relkit/inspector": patch
---

The Inspector's history store answers the new request filters of history queries, `status` (exact or class such as `5xx`), `method`, `path` (prefix) and `errorId`, with the same results as the application's own query, and returns `total`, the number of matching records across all pages, when a query asks for `count`.
