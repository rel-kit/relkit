---
"relkit": minor
"@relkit/cli": minor
---

`relkit check` refuses providers that cannot run on Cloudflare Workers when the project has a wrangler configuration (`wrangler.jsonc`, `wrangler.json` or `wrangler.toml`): a used profile on the local provider, a job or event provider with a worker loop, or no provider fails with `RELKIT_WORKERS_PROVIDER_UNSUPPORTED`, and a SQLite database with `RELKIT_WORKERS_SQLITE_UNSUPPORTED`. Each diagnostic names the provider and one that runs on Workers.
