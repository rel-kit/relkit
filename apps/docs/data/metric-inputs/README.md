# Metric inputs measured locally

CI outputs are not available when the docs are built from a checkout, so the metrics page falls back
to `apps/docs/data/metrics.json`, which is built from this folder plus the workspace itself. These
files are real walkthrough results from a local run on 2026-11-06 (task 28.2), not samples: an Apple
silicon Mac, Bun 1.3.10 and Node 24, fresh package caches for each runner.

- `walkthrough-first-route.json`: `bunx create-relkit` and `npx create-relkit` resolving the packed
  candidate from a local registry, one route added, `run dev` answering it. The slower runner is the
  figure; both runners' steps are listed.
- `walkthrough-railway.json`: the Railway newcomer flow, from creation until the deployed app
  answers over HTTPS, in a throwaway `relkit-test-*` project that the flow deletes.

Refresh them, then rebuild the report:

```sh
bun scripts/node-creation-smoke.ts --out <registry dir>
bun scripts/walkthrough/create-with-runner.ts --prepared <registry dir> --output apps/docs/data/metric-inputs/walkthrough-first-route.json
bun scripts/walkthrough/create-to-railway.ts --output apps/docs/data/metric-inputs/walkthrough-railway.json
bun scripts/metrics.ts --inputs apps/docs/data/metric-inputs --output apps/docs/data
```
