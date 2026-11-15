---
"@relkit/cli": patch
---

A file that does not parse is reported by `relkit dev` and `relkit check` at the parse error's own
line and column, with the parser's message (`Unexpected =` on Bun, `Unexpected "="` on Node) and
further errors listed briefly after it, instead of at line 1 with `2 errors building <absolute
path>`. On Bun, `relkit check` no longer waits for the evaluator's 10-second timeout when more than
one file imports the broken one.
