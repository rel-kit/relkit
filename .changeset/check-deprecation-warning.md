---
"relkit": patch
"@relkit/cli": patch
---

Fixed: `relkit check` passes on a project that still imports the final `@relkit/app`. The package's deprecation notice is reported as a `RELKIT_DEPRECATED_APP_PACKAGE` warning on the importing file instead of failing the check with `RELKIT_EVALUATOR_SIDE_EFFECT`.
