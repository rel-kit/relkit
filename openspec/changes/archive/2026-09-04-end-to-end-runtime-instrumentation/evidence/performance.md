# Runtime instrumentation performance evidence

Measured on 2026-09-03 with Bun 1.3.10 on an Apple M1 Pro. The reproducible
command is `bun run scripts/performance.ts`.

The benchmark compares recording disabled and enabled in the same build. This
replaces the archived comparison, whose malformed trace IDs, ephemeral event
delivery, and older graph layout made it unsuitable as an instrumentation
baseline.

| Workload | Baseline p50/p95 | Recording p50/p95 | Delta p50/p95 |
| --- | ---: | ---: | ---: |
| Direct invocation | 0.057 / 0.074 ms | 0.061 / 0.079 ms | +7.0% / +6.8% |
| Invocation with 10 custom spans | 0.062 / 0.076 ms | 0.096 / 0.121 ms | +54.8% / +59.2% |
| HTTP route | 0.117 / 0.163 ms | 0.145 / 0.189 ms | +23.9% / +16.0% |

The review percentages are sensitive to these sub-millisecond no-op workloads.
Direct invocation exceeds the median threshold by 0.004 ms while its p95 stays
within threshold. The operation-heavy case deliberately records ten spans
around no-op work; its absolute p50/p95 costs are 0.034/0.045 ms for all ten.
HTTP exceeds both thresholds by 0.028/0.026 ms. These measurements identify
small fixed recording costs rather than retained growth or workload-proportional
regression.

Assembly of a 512-span request execution detail averaged 0.580 ms with a 0.643
ms p95. After 2,000 recorded invocations and forced collection, heap usage was
27,930,267 bytes below its pre-run reading, so this run showed no retained-heap
growth.

Historical suite measurements remain available in the command output for
compilation, routes, local jobs, durable event fan-out, request streaming, and
Inspector graph layout. Event throughput is intentionally not compared with
the old ephemeral-delivery fixture.
