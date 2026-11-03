# Evidence

This directory keeps short Markdown summaries only. Full verification reports are CI artifacts and
GitHub release assets:

- Scripts that measure releases write full reports under the ignored `test-results/evidence`
  directory. CI uploads that directory as a workflow artifact kept for 90 days.
- Each GitHub release carries `evidence-<version>.tar.gz` with the reports from the CI run that
  verified it, plus these summaries. `bun scripts/release-evidence.ts bundle` builds the archive.
- `create-capabilities/<release>.md` summarizes the creation measurement for each `create-relkit`
  release.

`bun run check` fails when a file other than Markdown is added here, or when `docs/` reaches 5 MB.

Raw reports committed before this rule, including those the summaries in `lean-install/` and
`standalone-inspector/` refer to, remain in the repository history at commit
[`a93fed1e8`](https://github.com/rel-kit/relkit/tree/a93fed1e860d652cec4e724b8192d45a7fd35109/docs/evidence).
