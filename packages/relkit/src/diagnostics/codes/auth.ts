/** Codes about authentication: route sessions and the Better Auth schema. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const authCodes = [
  {
    code: "RELKIT_ROUTE_AUTH_UNAVAILABLE",
    title: "A route requires a session, but the app has no Better Auth service",
    happened:
      'A route sets `auth: "required"`, and the application defines no Better Auth service, so no request could ever have a session. At run time such a route answers every request with 401.',
    fix: 'Add a Better Auth service with `defineBetterAuthService({ auth })`, or remove `auth: "required"` from the route.',
  },
  {
    code: "RELKIT_AUTH_SCHEMA_MISMATCH",
    title: "The database schema does not match the installed Better Auth release",
    happened:
      "Better Auth checks the Drizzle schema when it starts and found a missing table or column, or a required column it never writes, so every sign-up and sign-in would fail. A project created before Better Auth 1.7.7 declares a required `account.issuer` column that Better Auth 1.7.3 and later never write.",
    fix: "Change the schema as the message lists: for `account.issuer`, run `relkit migrate --write` or remove the column and its index by hand (see /docs/modules/auth/better-auth#remove-the-account-issuer-column). Then run `db:generate` and `db:migrate`.",
  },
] as const satisfies readonly DiagnosticCodeEntry[];
