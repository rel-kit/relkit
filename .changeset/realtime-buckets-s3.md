---
"@relkit/s3": patch
---

The S3 bucket provider takes the bucket's `maxObjectBytes` and `allowedContentTypes` and applies them to `put` as the local provider does. `createWriteUrl(key, context, { contentType, contentLength })` refuses a type or length the bucket does not allow before signing, and signs `content-type` and the exact `content-length` (`X-Amz-SignedHeaders`), so the storage service rejects an upload with another type or length. A call without the options signs `host` only, as before.
