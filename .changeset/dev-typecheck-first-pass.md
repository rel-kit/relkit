---
"@relkit/cli": patch
---

`relkit dev` reports a type error saved while the type checker is still on its first pass. The checker reads the project before it watches it, so such a file was checked as it was before the save and never again: the terminal kept saying "No type errors". The first pass is now discarded and the checker started again (at most twice) when a source file was saved after it started.
