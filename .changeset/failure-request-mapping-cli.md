---
"@relkit/cli": patch
---

`relkit dev` prints the cause of a 500 in the terminal, now that it is no longer in the response
body. The generated development server sends the framework's HTTP error log to the
terminal: the line after `GET /path → 500` is the redacted cause (`Error: <message>`, with bound
query parameters masked) followed by the request and trace IDs; `--verbose` adds the stack. The
framework's `Execution operation failed` record for the same failure stays out of the terminal
outside `--verbose`. Production output is unchanged: these records go to the observability sink
only.
