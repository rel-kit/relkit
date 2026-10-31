---
"@relkit/cli": patch
"@relkit/inspector": patch
"@relkit/contracts": patch
"@relkit/observability-local": patch
---

Fix four inspector terminal problems. The editor plugin keeps its forwarded language-service methods enumerable, so editor plugins chained after it that copy the service with object spread no longer crash tsserver (#160). `relkit inspector` no longer starts a spinner, so Ctrl+C exits 130 and stops the inspector instead of leaving it running in the background (#162). Successful UI polling is no longer logged at INFO (#163). Failure logs from observed operations name their cause (error tag, operation label, native code, HTTP status) without native messages, and the history worker survives a process-group SIGTERM until the inspector flushes and closes it (#164).
