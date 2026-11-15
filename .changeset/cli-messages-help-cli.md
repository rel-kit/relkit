---
"@relkit/cli": patch
---

`relkit start` in a project that was never built now fails with `RELKIT_START_BUILD_MISSING` ("No build found in .relkit/build") and tells you to run `relkit build` first, instead of printing the operating system error twice. The CLI prints a code only when it is a RelKit code; any other error is reported as `RELKIT_INTERNAL_ERROR` with its original message.
