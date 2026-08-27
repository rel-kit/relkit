# 17.19 reproduction record

> The six byte-preserved local transcripts below are historical evidence from
> before the final deployment fixes. The committed product candidate is
> `73a7e3c16e0add0fe4a984d450f1e1c65a4499be`; current AWS product acceptance is
> covered by the owner-waiver record in [aws-integration-rerun.md](aws-integration-rerun.md),
> not by a cloud pass. Gate 16 remains pending while clean-candidate
> reproducibility is unclaimed for the preserved dirty worktree.

Run date: `2026-08-19`
Historical local candidate commit: `6c0e219974230c6b9071ca13ead5a8187e9ef45b`
Branch: `fix/implement-relkit-typescript-poc-v3`
Bun: `1.3.10`
Node: `v24.12.0`
Pulumi: `v3.258.0`
Environment: macOS `15.7.1` (`24G309`), `arm64`

## Exact results

|   # | Exact command                                   | Exit | Capture duration | Observed result                                                                   |
| --: | ----------------------------------------------- | ---: | ---------------: | --------------------------------------------------------------------------------- |
|   1 | `bun install --frozen-lockfile`                 |  `0` |         `0.018s` | 423 installs across 440 packages; no changes                                      |
|   2 | `bun run verify`                                |  `0` |        `50.411s` | fixed fail-fast pipeline passed; frozen-install and generated-file no-diff passed |
|   3 | `bun run test:e2e`                              |  `0` |        `14.867s` | 6/6 passed in `14.4s` as reported by Playwright                                   |
|   4 | `bun run test:container`                        |  `0` |         `1.891s` | 3 passed; 19 assertions                                                           |
|   5 | `bun run scripts/pack-and-smoke-create-relkit.ts` |  `0` |        `30.411s` | packed create smoke passed with 27 packages                                       |
|   6 | `bun run test:deployment`                       |  `0` |         `2.772s` | 14 passed; 1 release-gated test skipped; 108 assertions                           |

The current local repair verification separately passed `bun run verify`, all
pre-E2E `test:all` layers, local create/check/typecheck/build/start/dev smoke,
and an isolated six-spec Playwright run. The current same-directory exact
`RELKIT_AWS_INTEGRATION=0 bun run test:all` also passed every local layer,
including all seven Playwright tests. These results do not claim clean-candidate
reproducibility for the preserved dirty CLI/generator paths.

The local deployment command was invoked exactly as shown after setting
`RELKIT_AWS_INTEGRATION=0` in the process environment. The checked-in `.env`
enables the release case, so this process-only setup keeps the exact root
reproduction separate from the independently recorded release-gated AWS run.

## Environment preservation

- Before `bun run verify`, the pre-existing generated
  `apps/fixture-commerce/.relkit` and `test-results` directories were moved to
  `/tmp/relkit-gate16-17.19.zdylhf/preserved-generated` and were restored after
  verification/E2E without modification.
- E2E used external `@types/react@19.2.18` and `@types/node@26.2.0` symlinks.
  Both links and the external package directory were removed after the run.
- `package.json` and `bun.lock` had no diff in this historical run; the
  committed candidate includes the repair dependency changes.
- `bun run verify` recorded historical frozen-install no-diff and
  generated-file no-diff success; it does not prove current clean-candidate
  reproducibility.

## Raw transcripts

Each command has byte-preserved `stdout`, `stderr`, and `result` files in this
directory, numbered `01` through `06`. `transcript-sha256.txt` records their
SHA-256 checksums. Bun writes several test-runner records to stderr; both
streams are required to reconstruct the complete transcript.

The current release-gated AWS waiver and zero-live-resource cleanup record is
separate in `aws-integration-rerun.md`; it is not current product smoke
acceptance.

## Post-evidence checks

- Focused Prettier check: pass.
- JSON parse and `git diff --check`: pass.
- `openspec validate implement-relkit-typescript-poc-v3 --strict`: pass.
- Post-evidence `bun run scripts/secret-scan.ts`: pass; 2,604 files and
  340,604,821 bytes scanned with zero matches.
