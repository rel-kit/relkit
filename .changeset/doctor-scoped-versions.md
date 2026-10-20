---
"@relkit/cli": patch
"create-relkit": patch
---

Validate installed RELKIT packages against their own declared versions so doctor accepts independently versioned releases and still reports missing or incompatible installations.

Use each optional scaffold dependency's own version rather than the generator version, and refresh the generator when any bundled scaffold dependency changes.
