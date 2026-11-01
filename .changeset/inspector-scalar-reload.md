---
"@relkit/inspector": patch
---

The Inspector's API reference keeps working after the app reloads. It used to pin the generation it was opened with, so after any source edit every POST, PUT, PATCH or DELETE it sent failed with `409 generation.stale` until the page was reloaded by hand. Before each request it now reads the app's current generation with a lightweight `HEAD` request and sends against the current code. When the generation changed, the reference document is downloaded once and shown after that request's response arrives.
