---
"@relkit/cli": minor
---

`relkit check` finds community integration packages. Besides `relkit` and `@relkit/*`, imports of packages named `relkit-<name>` or `@<scope>/relkit-<name>` are read for `relkit.integration` metadata, so a provider published outside the `@relkit` scope can be selected in `relkit.config.ts`. The provider starter in `templates/provider-starter` and the new "Build and test a provider" guide show the full path from a new package to an installed provider.
