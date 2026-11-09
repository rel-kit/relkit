---
"relkit": minor
"@relkit/cli": minor
---

`createRelkit(config)` gives scripts, seeders and other frameworks the same runtime handle as `getRelkit()`. It activates the built application's providers from `.relkit/build` without an HTTP listener, event consumers or job workers, and `close()` releases them so the process can exit. Run `relkit build` first; without a build it throws `RELKIT_APPLICATION_BUILD_UNAVAILABLE`. The generated server entry now exports `activateRelkitApplication` and still starts itself when run directly.
