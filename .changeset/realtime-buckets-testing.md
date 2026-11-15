---
"@relkit/testing": patch
---

The bucket conformance suite has two new cases, `policy` and `signed-upload-limits`, run when the provider supplies `limited(prefix, policy)`: `put` refuses sizes and content types the bucket does not allow, and a signed upload URL is refused before signing for a disallowed declaration and makes storage reject an upload with another type or length. `upload` replaces the `fetch` used for those uploads.
