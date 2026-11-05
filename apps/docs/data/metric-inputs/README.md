# Metric inputs measured locally

CI outputs are not available when the docs are built from a checkout, so the metrics page falls back
to `apps/docs/data/metrics.json`, which is built from this folder plus the workspace itself. These
files are real walkthrough results from a local run on 2026-11-05, not samples.

Refresh them with `bun scripts/walkthrough/create-to-first-route.ts --output <file>` and
`bun scripts/walkthrough/create-to-railway.ts --output <file>`, then rebuild the report:

```sh
bun scripts/metrics.ts --inputs apps/docs/data/metric-inputs --output apps/docs/data
```
