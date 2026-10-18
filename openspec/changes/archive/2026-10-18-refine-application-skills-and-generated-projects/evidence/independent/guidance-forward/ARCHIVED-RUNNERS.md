# Historical runner snapshots

The four copied SQLite migration runners below are retained as `migrate.ts.txt`
snapshots. Their contents are unchanged from the evaluator's original artifacts;
they are historical input/output evidence, not maintained executable tooling.
Current generated applications use `relkit db migrate` instead.

- `case02/app/scripts/migrate.ts.txt`
- `case02/before/scripts/migrate.ts.txt`
- `case11/app/scripts/migrate.ts.txt`
- `case11/before-feature-ready/scripts/migrate.ts.txt`

The original hash manifests, diffs, package scripts and transcripts retain the
original `scripts/migrate.ts` names and hashes. To replay those historical cases,
materialize each snapshot under its original name in a disposable fixture first.
No historical success or failure has been rerun or relabeled by this archival
change. The archived runner's environment-selected filesystem writes are not a
supported migration boundary.
