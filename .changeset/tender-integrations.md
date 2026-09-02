---
"@relkit/ai-sdk": minor
"@relkit/app": minor
"@relkit/aws": minor
"@relkit/cli": minor
"@relkit/cloud-aws": minor
"@relkit/cloudflare": minor
"@relkit/deploy-pulumi": minor
"@relkit/docker": minor
"@relkit/integrations": minor
"@relkit/local": minor
"@relkit/local-service": minor
"@relkit/otlp": minor
"@relkit/provider": minor
"@relkit/providers-local": minor
"@relkit/providers-standard": minor
"@relkit/pulumi": minor
"@relkit/redis": minor
"@relkit/s3": minor
"@relkit/sentry": minor
"@relkit/testing": minor
---

Replace the pre-1.0 provider ownership contract and legacy provider package exports with `defineApp` bindings, explicit test replacements, and independently installable integration packages. This breaking cohort intentionally ships without compatibility aliases, old artifact readers, or migration tooling.
