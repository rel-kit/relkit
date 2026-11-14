---
"@relkit/inspector": patch
---

Fixed: the Requests page lists the newest requests first (page 1 used to hold the oldest), filters by status (a code or a class such as `5xx`), method, path, text, outcome and error ID, shows how many requests match, and keeps filters, page size and page in the URL so a filtered view can be reloaded and shared. A failed request now shows its declared error with a link to the error, the fields that failed validation and the kind of problem, and the recorded cause of an internal failure. The request detail shows the function's captured input and result instead of an empty headers and bodies panel, counts spans once, shows times with their zone, and names live and loaded requests the same way. The command palette (⌘K) takes the cursor when it opens and opens a pasted request or trace ID.
