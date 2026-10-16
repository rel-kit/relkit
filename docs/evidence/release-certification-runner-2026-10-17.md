# Release certification runner correction

The [failed release job](https://github.com/rel-kit/relkit/actions/runs/38954309786/job/117153349197)
stopped while certifying the packed 0.7.7 candidate. Its retained `fresh.json`
contains 20 correct HTTP responses with no cleanup failures. Twelve launches
exceeded the strict 1,000 ms ceiling: median 1,005.551 ms, p95 1,037.009 ms,
maximum 1,053.127 ms. The failure occurred before restart certification or release
PR creation, rather than during publication.

The failing measurements ran on `ubuntu-24.04-arm`. Existing retained passing
creation evidence was measured on macOS Apple Silicon. A fresh local packed
diagnostic using the current source and Bun 1.3.10 returned the exact application
response in 539.416 ms. This comparison supports a host-dependent timing failure;
it does not establish a Linux runtime correctness defect or a universal startup
performance guarantee.

Both the release version job and manually dispatched creation-certification job
now select `macos-15`, a pinned Apple Silicon reference-host family. GitHub lists
this as a standard arm64 runner in its
[runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
Turbo and Vitest are limited to one worker, with a 2 GiB Node heap cap. The
installed Vitest implementation recognizes `VITEST_MAX_WORKERS`, and Turbo rejects
an invalid `TURBO_CONCURRENCY=0` in a dry run, confirming the settings are consumed.

The one-second threshold, exact package identity validation, all 20 fresh and 20
restart measurements, restart preparation, rollback, failed-report retention,
permissions, and release handoff remain unchanged. Linux static checks,
typechecks, package builds, and installed-consumer smoke checks retain their
existing runners. The timing certification now describes the selected macOS host;
Linux sub-second startup is not established by this correction.

The focused workflow, certification rollback, versioning, and release-handoff tests
passed (20 tests). Both YAML documents parsed, formatting and `git diff --check`
passed, and parsed workflow comparison confirmed that only the two runner
selections and their resource settings changed. The existing packaged-bootstrap
import-boundary test also passed.
Before publication, `bun run prepush` passed with `TURBO_CONCURRENCY=1`,
`VITEST_MAX_WORKERS=1`, `NODE_OPTIONS=--max-old-space-size=2048`, and
`RELKIT_DOCGEN_CONCURRENCY=1`.

Full local packed measurements ran sequentially through the unchanged benchmark
and were accepted by `validateCreationReport` against the actual local identity:

- Fresh installations: 20/20, median 556.507 ms, p95 578.140 ms, maximum 584.466 ms.
- Restarts: 20/20, median 554.084 ms, p95 563.425 ms, maximum 578.904 ms.
- Separate restart preparation: 557.384 ms.
- Every sample returned the complete exact application response with no cleanup
  failure or premature child exit. Both fixture owners completed cleanup.

The commands were `bun scripts/benchmark-packed-dev.ts --set fresh --runs 20
--cleanup --output /tmp/relkit-ci-38954309786-fresh.json` and its `restart` variant,
with the job's resource limits and `RELKIT_DOCGEN_CONCURRENCY=1`. Local reports and
logs remain under `/tmp/relkit-ci-38954309786-*`; they are diagnostic records,
separate from versioned release certification.

The local package version is 0.7.6. These diagnostic measurements must not replace
or relabel the failed 0.7.7 candidate's reports. The updated hosted workflow still
needs to regenerate and validate exact 0.7.7 evidence before it can release.
Publication of the workflow correction does not certify or publish that candidate.
