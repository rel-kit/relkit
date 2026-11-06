---
"@relkit/testing": minor
"@relkit/cloudflare": patch
---

Provider conformance suites. `@relkit/testing` publishes the cache, buckets, realtime, events and jobs suites as `@relkit/testing/cache-conformance`, `/buckets-conformance`, `/realtime-conformance`, `/events-conformance` and `/jobs-conformance`, the same cases every first-party provider runs, with failure injection through a failing provider you supply. `runConformance` from `@relkit/testing/conformance` reports pass, fail or skip per case. The Cloudflare KV and R2 binding providers now reject an operation whose signal is already aborted.
