# Task 17.16 performance baseline and stability acceptance

Run date: `2026-08-18`  
Bun: `1.3.10`  
Node: `v24.3.0`  
Platform: `Darwin 24.6.0 arm64`  
CPU: `Apple M1 Pro`, 10 cores, 16 GiB

## First stable baseline

The existing `scripts/performance.ts` harness was executed five times with
the exact command `bun run scripts/performance.ts`. Every run exited `0` and
reported protocol `zsys.performance` version `1`. Run 2 at
`2026-08-18T20:10:40.242Z` is stored as the first stable baseline in
`metadata.json`; the four other runs are recorded there as stability evidence.

The harness covered 100, 1,000, and 10,000 descriptors; graph size and heap
delta; warm direct invocation, route, and request-stream overhead; local job
throughput; eight-way event fan-out; 1,000-node inspector layout; and
candidate activation. Thresholds remain `null` as required before a measured
regression budget exists.

| Measurement                              |                                      Baseline |
| ---------------------------------------- | --------------------------------------------: |
| Compile 100 / 1,000 / 10,000 descriptors |                  14.348 / 52.848 / 426.316 ms |
| Graph bytes 100 / 1,000 / 10,000         |                  34,333 / 343,933 / 3,448,933 |
| Heap delta 100 / 1,000 / 10,000          |             0 / 17,813,934 / 88,322,708 bytes |
| Warm direct invocation                   |                  7.030 ms total; p95 0.144 ms |
| Warm route                               |                  8.959 ms total; p95 0.144 ms |
| Request stream                           |                  4.425 ms total; p95 0.058 ms |
| Local job                                |    100 completed in 993.649 ms; 100.639 ops/s |
| Event fan-out                            | 800 completed in 191.464 ms; 522.292 events/s |
| Inspector layout                         |             1,000 nodes/999 edges in 0.756 ms |
| Candidate activation                     |                  0.486 ms total; p95 0.010 ms |

All five runs retained the same graph bytes, graph hashes, node counts, job
completion count, event completion count, and inspector dimensions. Runtime
timings varied as expected for short in-process measurements; one route run
was slower at 14.927 ms. Heap delta varied more widely, consistent with
garbage-collection timing, so it is retained as diagnostic data and is not a
release threshold.

## Instability and resource-leak inspection

The lifecycle-heavy command
`bun test tests/restart tests/integration/engine/fixture-resources.test.ts`
was run three times. Each run passed 7 tests, 41 assertions, and exited `0`
(21 test executions and 123 assertions total). No intermittent failure or
timeout occurred.

The performance harness closes both temporary provider fakes with
`await job.close()` and `await event.close()`. The existing test harness close
paths close stores/logs/routers and remove owned temporary state roots. After
all five performance runs and all three lifecycle runs, no matching
`/tmp/zsys-*` temporary state roots remained, and Git showed no performance
or test-source drift. The ignored workspace `.zsys` state observed during the
inspection was pre-existing and was not modified by these runs.

## Follow-up disposition

One measured, non-blocking follow-up is recorded: heap deltas are GC-sensitive
(`60,556,825`–`110,190,803` bytes at 10,000 descriptors across the repeated
runs). Future profiling can add explicit GC/control before setting a memory
budget. No Rust work, speculative optimization, threshold, or release-scope
change was added.

No 17.17 or later checkbox was implemented.
