# Data model showcase

The example covers SQLite CRUD, generated Zod schemas, composite unique selectors,
transactions, operation overrides, and custom model functions receiving `{ table, database }`.

From this directory, use a new local file:

```sh
export DATABASE_PATH=./data-model.sqlite
bun run db:migrate
bun run check
bun run typecheck
bun test
bun run dev
```

Drizzle Kit generates migrations from `src/services/database/schema/index.ts` into
`src/services/database/migrations`; the initial SQL and snapshot are already tracked.
After editing a table, run `bun run db:generate --name=your-change`, review the SQL
and required metadata, then migrate. `db:migrate` uses installed `relkit db migrate`
and root `drizzle.config.ts`; `--config <path>` selects another explicit config.
Migration execution lives in RELKIT rather than a copied application runner.
Keep one ordered history for the database and preserve applied identifiers/logs.
The service opens a connection; it does not create tables.
Do not apply the initial migration to an existing database without establishing a baseline.

`users.registerMember` inserts a user and membership together. `users.updateUserEmail`
uses generated update/select validation. Both are internal workflow examples without public
write routes; add authorization before exposing them. Only `listUsers` is mounted at `/users`.

See the Database guides in `apps/docs/content/docs/database/` for setup, modeling,
customization, migrations, and testing. Tests apply generated migrations to isolated
databases; the migration test verifies that a second shared-tooling run preserves rows.
