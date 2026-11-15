---
"@relkit/better-auth": patch
"@relkit/cli": patch
"create-relkit": patch
"relkit": patch
---

Breaking: RelKit now requires and installs Better Auth 1.7.7 instead of 1.7.1, so `npm audit` no
longer reports the critical `better-auth` advisory (OAuth Proxy and OAuth state sign-in as another
user, GHSA-r4xp-prcw-77qf and GHSA-965c-763c-88jm) or the low `@better-auth/drizzle-adapter` one
(rate limits on PostgreSQL, GHSA-44jh-23m7-hpcf). Better Auth 1.7.3 and later never write the
required `account.issuer` column that projects created for 1.7.1 declare, and refuse to start while
the Drizzle schema declares it. `relkit add auth` now generates the account table without `issuer`
and without the unique index on `issuer` and `accountId`, for SQLite, PostgreSQL and MySQL. An
existing project runs `relkit migrate --write`, which removes the column and its index from the
schema file, then `db:generate` and `db:migrate`; no user, account or session is lost. See
[Remove the account issuer column](/guides/migrate/relkit-0-9#better-auth-account-issuer).

When the project's schema does not match the installed Better Auth release, auth now stops at
startup with `RELKIT_AUTH_SCHEMA_MISMATCH`, naming each table and column and the change to make,
instead of logging Better Auth's "Drizzle schema mismatch" and failing every sign-up and sign-in.
