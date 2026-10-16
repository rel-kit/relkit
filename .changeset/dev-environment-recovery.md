---
"@relkit/cli": patch
"@relkit/supervisor": patch
---

Refresh development candidate environments after dotenv edits and observe dotenv repairs in prepared sessions. Preserve the last valid server during failed reloads and remove deleted file-managed values from subsequent candidates.

Forward resolved application environment values to HTTP function invocations.

Keep manual source-watcher admission synchronous while retaining lazy watcher loading for CLI sessions.
