---
"@relkit/testing": patch
---

Fixed: `createTestApplication` honours its `context` option. The fields you pass reach handlers and
replace the application's own, such as `auth` or `database`, as they do in `createTestRuntime`.
Before, the option was accepted and ignored.
