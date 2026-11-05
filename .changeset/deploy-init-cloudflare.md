---
"@relkit/cli": minor
---

`relkit deploy init cloudflare` writes `wrangler.jsonc` (the Workers build, `nodejs_compat`, static assets, and the KV, R2, Durable Object, queue and Cron Trigger bindings the application graph needs), the Worker entry `worker.mjs` and `.github/workflows/cloudflare-deploy.yml`. Existing identical files are kept and differing ones need `--force`; no cloud resource changes.
