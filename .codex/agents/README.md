# Project-local agent profiles

These are the only project-local profiles required by the OpenSpec iterator.
They keep delegated work bounded and visible in the normal checkout.

- `cipay-implementation.toml`: implementation work for one explicitly assigned scope.
- `cipay-branch-review.toml`: read-only branch and gate review.
- `cipay-db-ledger-engineer.toml`: database-migration investigation only; applying a non-disposable migration still requires user approval.

Each delegated agent reads `AGENTS.md`, the matching profile, and the exact
OpenSpec context named in its prompt. Agents do not update lifecycle notes or
commit, stage, push, or use alternate worktrees.
