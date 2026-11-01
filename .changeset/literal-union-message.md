---
"@relkit/schema": patch
---

A value rejected by a union of literals, such as an enum built from `z.union([z.literal("a"), z.literal("b")])`, now reports the accepted values, for example `Expected one of: "a", "b"`, instead of `Value did not match any union member`.
