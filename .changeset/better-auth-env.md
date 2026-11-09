---
"@relkit/cli": minor
---

Breaking: `relkit add better-auth` declares `BETTER_AUTH_URL` without a default, next to `BETTER_AUTH_SECRET`; a server started without either fails with `RELKIT_ENVIRONMENT_INVALID`. See the [0.9 migration guide](https://relkit.dev/guides/migrate/relkit-0-9#better-auth-file).
