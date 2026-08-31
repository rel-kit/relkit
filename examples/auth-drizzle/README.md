# Better Auth + Drizzle showcase

From this directory, after installing workspace dependencies:

```sh
export DATABASE_PATH=./auth.sqlite
export BETTER_AUTH_URL=http://127.0.0.1:3000
export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"
bun run db:migrate
bun run check
bun run typecheck
bun test
bun run dev
```

Open `http://127.0.0.1:3000`. Use the same hostname for the page and API. The secret
above is for a fresh local session; store a stable secret securely for subsequent
runs and deployments. Never commit secrets or database files.

Better Auth owns sign-up, sign-in, sign-out, and cookies. RELKIT functions read
`context.auth.getSession()`. `/session` is public; `/account/profile` requires a
valid session. The HTML page exercises these flows without a frontend framework.
`src/platform/auth-client.ts` shows the native Better Auth TypeScript client.
`src/platform/browser-client.ts` is a separate RELKIT transport-header example:
setting a bearer header does not enable server-side bearer authentication.

Tables live in `src/database/schema/index.ts`. After changing them, run
`bun run db:generate`, review the generated migration, and run `bun run db:migrate`
against the explicitly selected database. Startup does not create tables. Tests
migrate a temporary database and clean it up; they never use your local database.
