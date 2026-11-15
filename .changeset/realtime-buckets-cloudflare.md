---
"@relkit/cloudflare": patch
---

The R2 bucket provider takes the bucket's `maxObjectBytes` and `allowedContentTypes`, applies them to `put`, and binds a declared content type and exact length into signed upload URLs, as the S3 provider does. The R2 binding provider takes no limits yet.
