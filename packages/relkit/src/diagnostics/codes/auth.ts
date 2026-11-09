/** Codes about route authentication. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const authCodes = [
  {
    code: "RELKIT_ROUTE_AUTH_UNAVAILABLE",
    title: "A route requires a session, but the app has no Better Auth service",
    happened:
      'A route sets `auth: "required"`, and the application defines no Better Auth service, so no request could ever have a session. At run time such a route answers every request with 401.',
    fix: 'Add a Better Auth service with `defineBetterAuthService({ auth })`, or remove `auth: "required"` from the route.',
  },
] as const satisfies readonly DiagnosticCodeEntry[];
