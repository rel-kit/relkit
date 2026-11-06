---
"relkit": minor
"@relkit/testing": minor
"@relkit/cli": minor
---

Breaking: Every HTTP error response is now RFC 9457 Problem Details with the `application/problem+json` content type: `type`, `title`, `status`, `code`, `detail`, `traceId`, and `data` or `issues` where they apply. Declared errors use their ID as `code`; RelKit's own errors use codes such as `validation`, `not-found`, `rate-limited` and `internal-error`. Branch on `code` instead of the old `error` field. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#problem-details).
