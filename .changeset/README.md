# Changesets

Run `bun run changeset` for user-visible package changes. Select the affected
public package and describe the change for release notes. Documentation, tests,
and internal chores may merge without a changeset.

All publishable packages share one fixed version. Automation converts pending
changesets into the reviewed `changeset-release/main` pull request.
