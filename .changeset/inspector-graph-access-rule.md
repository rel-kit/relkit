---
"relkit": patch
"@relkit/inspector": patch
---

The Inspector's graph carries each function's access rule (its roles, its permissions, and whether a predicate decides), so the architecture view counts a route whose function is guarded as protected. Route groups no longer read "all public"; without a reported rule they read "no access rule reported".
