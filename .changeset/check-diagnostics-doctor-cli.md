---
"@relkit/cli": patch
---

On Node, an application import of a module that exists only on Bun (`bun`, `bun:*`,
`drizzle-orm/bun-sql`, `drizzle-orm/bun-sqlite`) is reported by `relkit check`, `dev`, `build` and
`local` as `RELKIT_EVALUATOR_BUN_RUNTIME_REQUIRED` at the import line, with both ways out: run the
command with Bun, or use `openSqliteDatabase`, `openPostgresDatabase` or `openMysqlDatabase` from
`@relkit/drizzle`. A Bun-only module loaded by a dependency is reported at the import that leads to
it.

When a file fails to load, `relkit check` reports that failure once, without the type errors that
only followed from it, and `relkit graph` says that the last check failed and names its first
error.

`RELKIT_PROVIDER_RELEASE_SOURCE_REQUIRED` points at the binding's entry in the configuration and
says what to write instead. The graph's environment variable and provider binding nodes point at
their own declarations instead of the `defineApp(` call, and a service whose functions declare an
access rule depends on the authentication service, so the Inspector lists the users of the auth
domain.

`relkit doctor` reports application imports the current runtime cannot load, the environment files
present and whether the runtime loads them, `patchedDependencies` that npm or pnpm ignores, and a
missing npm approval of esbuild's install script. On Node, `relkit start` and `relkit local` read
`PORT`, `relkit jobs` reads `RELKIT_INTERNAL_ENDPOINT_TOKEN` and `relkit doctor` reads AWS
credentials from the application's environment files, and `relkit start` passes the file values to
the built server.
