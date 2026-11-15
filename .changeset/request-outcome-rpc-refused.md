---
"relkit": patch
---

Fixed: a 404 from the RPC endpoint (`relkit.rpc`), such as a call to a procedure it does not
serve, is recorded with the outcome `refused` instead of `declared-error`: the framework refused
it, and no application declared that error.
