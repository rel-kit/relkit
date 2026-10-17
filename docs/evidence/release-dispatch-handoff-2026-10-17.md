# Bot release dispatch handoff

## Observed gap

[Release versioning 39045459312](https://github.com/rel-kit/relkit/actions/runs/39045459312)
passed and created [release PR #123](https://github.com/rel-kit/relkit/pull/123).
Its exact 0.7.7 evidence retained 20 successful fresh starts, 20 restarts, and
preparation, with timing failures kept separate. Both dispatched CI
39046251175 and approved PR CI 39046251278 passed. PR #123 merged as
`535af3ddc1dbda5c2323e3c17f40c63e57a8a934`, but neither downstream Release nor
main CI started through the existing event-based handoff.

[GitHub's token trigger rules](https://docs.github.com/en/enterprise-cloud%40latest/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
exempt explicit workflow dispatch from event recursion suppression. Publication
must therefore own explicit dispatch at both bot-driven handoffs.

## Correction

After the dispatched release branch publishes its completed CI Gate status, a
separate job reuses the existing bounded exact-PR handoff: match repository,
branch and tested head, wait for merge, require the exact current main merge
commit, and avoid duplicate main CI runs. The handoff payload carries the actual
completed CI Gate result; it does not claim the enclosing workflow has finished.

Dispatched main CI explicitly dispatches Release with its commit and run ID.
Release waits for that actual run to finish successfully before selecting a
release mode. Run ID, workflow name/path, repository, main branch, event, commit,
terminal success and a finite admission window are independently checked.
Ordinary main pushes retain their existing event-based release path. No PAT,
GitHub App credential, new runner, or skipped safety gate is needed.

## Validation

Focused tests cover pending-to-successful completion, failed/cancelled results,
wrong authority fields, finite waiting, slow API completion, malformed caller
inputs, workflow wiring, and the existing exact-PR handoff adversarial matrix
(17 tests). The verifier CLI also checked real completed main CI run
39045205476 against commit `c83abb69e728ac4d2bba1ef9fddd765af1349842`.
Hosted dispatch and publication outcomes remain separate acceptance evidence.

Main dispatch probe 39047432443 passed its CI Gate but skipped the downstream
dispatch job because its implicit `success()` included skipped optional
ancestors. Both explicit handoffs now use `!cancelled()` plus successful gate
results: this overrides implicit status propagation while refusing dispatch
after cancellation. Workflow regression checks retain this condition for each
handoff. The release verifier still requires actual completed successful CI.
