/** Codes about route authentication. */
import type { DiagnosticCodeEntry } from "./codes.types.js";

export const authCodes = [
  {
    code: "RELKIT_ROUTE_AUTH_UNAVAILABLE",
    title: "A route requires a session, but the app has no Better Auth route",
    happened:
      'A route sets `auth: "required"`, and the application does not mount a Better Auth handler, so no request could ever have a session. At run time such a route answers every request with 401.',
    fix: 'Mount Better Auth with an `ALL` route whose handler is your Better Auth service\'s handler, or remove `auth: "required"` from the route.',
  },
] as const satisfies readonly DiagnosticCodeEntry[];
