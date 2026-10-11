# Final source audit

## Scope and method

The implementation was reviewed against the repository Effect guidance, the
`use-effect` workflow, repository conventions and the version-matched source
ledger in `effect-source-evidence.md`. Discovery used CodeGraph before textual
search. Relevant installed Effect 4.0.1 implementations, tests and examples were
checked; gaps in the read-only reference checkout are recorded in the ledger.

The final changed implementation inventory contains 129 TypeScript files under
package, integration and script source roots, excluding tests and generated
artifacts. No changed implementation file exceeds the repository 250-line bound.
The largest is `build-prepared-manifest.ts` at 228 physical lines. Other larger
units were split by service, lifecycle or data responsibility rather than hidden
behind broad helper modules.

## Semantic findings resolved

- Validation, preparation, publication, candidate acquisition, telemetry and
  local-service operations have service-owned interfaces with live and test
  implementations. Public failures use bounded typed data instead of `unknown`.
- Success values crossing activation boundaries are immutable and reused; errors
  are recovered selectively at the fallback owner rather than caught globally.
- Files, children, readers, watchers, sockets, workers and background fibers are
  acquired and finalized within their owning scope. Abort signals compose rather
  than overwrite caller cancellation.
- Parallel and background work is bounded. Shutdown joins owned work and leaves
  detached or user-owned resources intact.
- Logging and telemetry preserve safe structured fields, operation identity,
  correlation and failure causes without duplicating adapter-level counts.
- Environment values are activation inputs. Secret values, their digests and
  staging roots are excluded from receipts and snapshot bytes.
- Route partitions are derived from Bun's emitted metafile, validated against the
  immutable inventory, and loaded through per-generation single-flight imports.
  Requests retain independent contexts and use the common engine/Hono contracts.
- Export/import moves were checked against repository boundaries; generated
  reference files were regenerated through the existing documentation tool.

## Verification boundary

The packed public-response certificates cover the only published tuple. Docker
and cloud paths remain candidate-only and make no timing claim. The work does not
authorize release, deployment, Git staging or publication.
