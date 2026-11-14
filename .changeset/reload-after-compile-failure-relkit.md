---
"relkit": patch
---

The development module reloader (`createModuleReloader` from `relkit/host`) has
`discardFailed()`, and `invalidate()` now drops modules that a failed import left behind. On Bun,
an import that failed to parse left its modules in the loader, and the next import of any of them
never settled; a module that threw at the top level came back half-initialized. A reload after a
syntax error no longer hangs.
