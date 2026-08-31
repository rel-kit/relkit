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

Drizzle Kit generates migrations from `src/database/schema/index.ts`; the initial
migration is already included. After editing a table, run `bun run db:generate --name=your-change`,
review the output, then migrate. The service opens a connection; it does not create tables.
Do not apply the initial migration to an existing database without establishing a baseline.

`users.registerMember` inserts a user and membership together. `users.updateUserEmail`
uses generated update/select validation. Both are internal workflow examples without public
write routes; add authorization before exposing them. Only `listUsers` is mounted at `/users`.

See the Database guides in `apps/docs/content/docs/database/` for setup, modeling,
customization, migrations, and testing. Tests apply generated migrations to isolated
databases; the migration test verifies that a second Kit run preserves rows.
