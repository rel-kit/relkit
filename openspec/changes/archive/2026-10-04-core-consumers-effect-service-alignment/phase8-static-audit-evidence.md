# Phase 8 support evidence

Read-only audit snapshot is `/tmp/relkit-phase8-support-evidence.json`, with complete captured output, monotonic durations, commands, exit codes, and source hashes. The audit was rerun after testing companion/observation fixes; later final HTTP owner changes add one native fixture, so the assembled repository verification remains authoritative.

Boundary check passed: 60 roots, 4078 TypeScript files (2439.593 ms). Public authoring lint passed: 90 source/example fragments (208.370 ms). Konsistent configuration validation passed (304.564 ms); its advisory audit returned the expected exit 1 (355.040 ms), retaining 88 existing findings across 22 files. Twenty files are byte-identical to baseline; the two changed entrypoints retain only their prior offending declarations. Rules and baseline findings were not weakened.

Observability sink scan passed (458.205 ms). The source change moves the exact native SSE exporter exception from `observability.ts` to `observability-stream.ts`, preserving every scan/redaction rule and introducing no wildcard. Frozen scan-source SHA256: `ef55f6e7bd4c8b07696c0a3cd32a95fe3c227e473987d566116db7518c4fb5a1`; independent Root EOF review was requested. The implementation-size scan reported no offenders (97.217 ms).

Scoped formatting initially reported two Supervisor test files (2116.305 ms); Root subsequently fixed those with apply_patch and reported final Supervisor format acceptance. Testing's own final full-path Prettier check passes. Full assembled formatting/verification replay is pending Root execution.

Root `test:inspector` passed 11 cases across four files, 42 expects, Bun-reported 1124 ms. Coverage includes job name filters, native fixture retry/approval resume, protocol boundary scans and generated event/bucket runtime wiring. No Inspector source edits were needed.

Independent full-file review accepted the docs catalog's clients definition-path update to `packages/client/src/transport.ts`, retaining the public index re-export and guide checks. Catalog SHA256: `9b9ec2ffab598a547c07fc3174bb23b9fedeb2005d5018eb28afe08eb60ca8a4`.

Disposable candidate replay pair: `/tmp/relkit-core-consumers-demo-3d6cp84c/{demo,fixture}`. Disposable baseline pair: `/tmp/relkit-core-consumers-demo-baseline-nnq5hlav/{demo,fixture}`. Their machine-readable copy/setup/preservation provenance resides in each root. Both use owned direct absolute dependency links; no installer, global Bun link registration, original setup script, original manifest or history was changed. The only external dependency exception is the original read-only OpenAI SDK 1.6.2; candidate and baseline Langchain/Langgraph come from their explicit framework dependency roots. Child commands inherit only an OS environment allowlist, excluding paid credentials. Baseline primary HEAD is exactly `b0f77720764fd61e9872b0995e456014a611ba37`, with packages/integrations source parity verified.

Original demo HEAD remains `1faed92bfd52a71771251f995a46c88daab8bf40`, status clean. Authored source63, history177 and fixture30 files retain their before/after SHA maps. Candidate demo check and typecheck passed as pre-acceptance readiness checks; no baseline check, unit replay, host, paid/cloud action or fresh live/diagnostic outcome is claimed yet. These wait for the assembled verification freeze and serialized replay.
