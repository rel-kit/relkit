# Fault matrix

The matrix maps each required failure or concurrency class to its owning focused
coverage. Deterministic Layers are paired with real processes where lifecycle,
filesystem, socket or module-loader behavior matters.

| Scenario | Owning coverage | Outcome |
| --- | --- | --- |
| Publication relocation and root independence | `snapshot-publication-native`, `snapshot-sealed-artifacts`, packed generator acceptance | Pass |
| Source/helper/asset add, delete and byte edit | snapshot inventory and TypeScript input-journal tests | Pass |
| Config, tsconfig, lockfile, patch, tool and dependency changes | receipt, dependency, tool and eligibility tests | Pass |
| Malformed, oversized, incompatible, escaped or mixed cache data | snapshot decode, cohort, files, publication and corrupt-pointer packed fixtures | Pass |
| Concurrent writers and interrupted preparation | publication service/native tests and staged generation failure/cancellation tests | Pass |
| Edits during validation/activation and rapid saves | publication epochs, source-watch and supervisor watcher tests | Pass |
| Deferred module partitions and transitive chunks | route-import and prepared-manifest tests | Pass |
| Deferred simultaneous requests and failing imports | real dynamic-import memoization tests | Pass |
| First/subsequent HTTP semantics | prepared Hono contracts plus packed two-request acceptance | Pass |
| Auth, middleware, precedence, rate limits, mapping, response and trace preservation | Hono route/materialization contract suites | Pass |
| Backend and inspector port conflicts | initial-dev, support and inspector-resolution fixtures | Pass |
| Socket-only, wrong-body, wrong-cohort, stale and early-exit children | candidate probe, graph proof and supervisor verification tests | Pass |
| Candidate acquisition, cancellation, process-tree reaping and retirement | candidate adapter, supervisor cancellation and benchmark harness tests | Pass |
| Streaming drain and exactly-once request completion | Hono streaming and supervisor drain/process fixtures | Pass |
| Delayed/failed inspector and telemetry startup | independent support-start tests | Pass |
| Early observation overflow, redaction and loss visibility | early-record and telemetry-relay loss tests | Pass |
| Concurrent early-to-live handoff, persistence failure and recovery | early-record storage and relay handoff tests | Pass |
| Healthy service reuse, wrong owner/plan and unhealthy provider | local materializer, lease, provider and recipe contracts | Pass |
| Unrelated/user-owned service preservation | ownership-aware service lifecycle tests | Pass |
| Harness wrong response, timeout and cleanup failure accounting | packed benchmark deterministic/native tests | Pass |

Cold Docker provisioning is not included in either readiness distribution and no
shipped capability requires Docker. Provider absence, unhealthy state, ownership
and plan mismatch are covered without starting Docker. No paid cloud action was
performed and no cloud tuple is published.
