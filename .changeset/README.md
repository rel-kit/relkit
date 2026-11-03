# Changesets

Run `bun run changeset` for user-visible package changes. Select the affected
public package and describe the change for release notes. Documentation, tests,
and internal chores may merge without a changeset.

Publishable packages form one fixed group: every release gives `relkit`,
`create-relkit` and every `@relkit/*` package the same version, which is also the
release's Git tag. Automation converts pending
changesets into the reviewed `changeset-release/main` pull request.
