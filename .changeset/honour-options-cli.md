---
"@relkit/cli": patch
---

Fixed: `relkit check` names a provider profile that a descriptor names and the application does not
have (`Provider profile "x" does not provide event.`). Before, it reported the use as unqualified.
