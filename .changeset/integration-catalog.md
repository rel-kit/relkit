---
"create-relkit": minor
"@relkit/aws": minor
"@relkit/cli": patch
---

Breaking: `@relkit/integrations` and `@relkit/providers-standard` are no longer published. `create-relkit` now carries the integration catalog, and `relkit add` refuses an integration package that is not part of the current release. The AWS deployment components from `@relkit/cloud-aws` now live inside `@relkit/aws`, and Pulumi is an optional peer dependency there.
