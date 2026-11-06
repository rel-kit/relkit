# Good first issue drafts

Ten small, self-contained issues grounded in gaps found in the repository on 2026-11-05.
`scripts/launch/apply-github.ts` creates them (dry run by default). Each entry is a `##` heading
(the issue title), a `Labels:` line, and the body. The existing issue #174 (a docs gap in the Better
Auth reference) also gets the `good first issue` label; it is listed in the apply script.

## docs: add a README to @relkit/cli

Labels: good first issue, documentation

`packages/cli` has no `README.md`, so the package page on npm is empty.

**What to do**

- Add `packages/cli/README.md` with: what `@relkit/cli` is (the `relkit` command: `dev`, `check`,
  `build`, `add`, `deploy`, `migrate`, `mcp`), how to install it, and a link to the
  [CLI reference](https://relkit.dev/docs/api/cli).
- Use the product name `RelKit` in prose and follow `WRITING.md`.

**Done when** `bun run check` passes and the README renders on the package page after the next
release. `packages/relkit/README.md` is a good model.

## docs: add a README to @relkit/client

Labels: good first issue, documentation

`packages/client` has no `README.md`, so its npm page is empty.

**What to do**

- Add `packages/client/README.md`: what the typed client is, one short example of calling an API
  reference such as `api.orders.list`, and links to the client guide on https://relkit.dev.
- Follow `WRITING.md` (plain language, one product name).

**Done when** `bun run check` passes and the example type-checks if you add it to a docs page too.

## docs: add a README to @relkit/testing

Labels: good first issue, documentation

`packages/testing` has no `README.md`.

**What to do**

- Add `packages/testing/README.md`: what the package provides for testing RelKit apps, how to install
  it as a dev dependency, and a link to the testing docs.
- Follow `WRITING.md`.

**Done when** `bun run check` passes.

## docs: add a README to @relkit/drizzle

Labels: good first issue, documentation

`packages/drizzle` has no `README.md`. It is an optional tool, so the README should say what it is
for and link to the database guide.

**What to do**

- Add `packages/drizzle/README.md` with a two-paragraph description, install command and a link to
  https://relkit.dev/docs/modules/database.
- Follow `WRITING.md`.

**Done when** `bun run check` passes.

## chore: add npm keywords to the first-party packages

Labels: good first issue

None of the six first-party packages (`relkit`, `@relkit/cli`, `@relkit/client`, `@relkit/inspector`,
`@relkit/testing`, `create-relkit`) sets `keywords` in `package.json`, which makes them harder to find
on npm.

**What to do**

- Add 5 to 8 relevant keywords to each manifest, for example `typescript`, `backend`, `framework`,
  `bun`, `effect`.
- Add a Changeset for the packages you touched (`bun run changeset`).

**Done when** `bun run check` passes and the release check
(`bun run release:check`) still validates the manifests.

## docs: add "pick your first issue" to CONTRIBUTING

Labels: good first issue, documentation

`CONTRIBUTING.md` explains setup and the checks, but not how to find a first task.

**What to do**

- Add a short section before "Pull requests" that says: filter issues by the `good first issue` label,
  comment on the issue before you start, and that maintainers answer within a few days.
- Keep it under ten lines.

**Done when** `bun run check` and the contributor quickstart job pass.

## docs: link GitHub Discussions from the issue template chooser

Labels: good first issue, documentation

`.github/ISSUE_TEMPLATE/config.yml` offers a security link and the docs but not Discussions, so
questions end up as issues.

**What to do**

- Once Discussions is enabled, add a `contact_links` entry named "Ask a question" that points at
  https://github.com/rel-kit/relkit/discussions.
- Check the `question.yml` template: say that questions belong in Discussions.

**Done when** the issue chooser on GitHub shows the new link.

## fix(templates): type-check event functions in a new project

Labels: good first issue, bug

The templates' `tsconfig.json` lists `.relkit/generated/route-module-checks.ts` and
`.relkit/generated/context-registry.d.ts` under `files`, but not
`.relkit/generated/event-registry.d.ts`. In a project that defines an event function,
`tsc --noEmit` fails until you add the file by hand (the Railway newcomer test does this in
`scripts/railway-newcomer/project.ts`).

**What to do**

- Add the event registry to the `files` list of the templates that can define events, or document why
  `relkit add events` should add it instead.
- Template files are pinned by digest: re-pin it in `packages/create-relkit/src/create-capabilities.ts`
  (see the commit "re-pin the minimal template digest" for the pattern).

**Done when** a project created from the template and given an event function passes `bun run typecheck`.

## fix(cli): hide the retired --inspector-port flag from relkit dev --help

Labels: good first issue, bug

`relkit dev --help` still lists `--inspector-port integer  Retired; configure
inspector.connection.port, or run relkit inspector --port`. A retired flag adds noise to the help of
a command people read first.

**What to do**

- Stop listing the flag in the help output of `relkit dev` but keep rejecting it with the existing
  message (see `packages/cli/src/commands/dev-inspector.ts`).
- Update the help snapshot and the generated CLI reference.

**Done when** `relkit dev --help` no longer shows the flag and `relkit dev --inspector-port 1` still
prints the retirement message.

## docs: link the jobs integrations from RELKIT_TASK_RUNTIME_UNAVAILABLE

Labels: good first issue, documentation

The fix on the page for `RELKIT_TASK_RUNTIME_UNAVAILABLE` says "Run these jobs through a jobs
integration such as `@relkit/inngest` or `@relkit/trigger`" without linking either package's docs.

**What to do**

- Find the code's catalog entry (search for `RELKIT_TASK_RUNTIME_UNAVAILABLE` under
  `packages/relkit/src/diagnostics`) and add links to the two integrations' docs pages.
- Regenerate the docs with `bun --cwd=apps/docs run generate`.

**Done when** the generated page links both packages and `bun run check` passes.
