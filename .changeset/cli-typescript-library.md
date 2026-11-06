---
"@relkit/cli": patch
---

Ship the TypeScript default library with the CLI's bundled parser. The bundle looked for `lib.*.d.ts` at the path of the machine that built it, so anywhere else (a Docker build stage such as Railway's, or a published install) RelKit's route checks saw no global types and `relkit build` rejected every route with `RELKIT_ROUTE_MODULE_TYPE`.
