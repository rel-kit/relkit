/** Projects route authentication and function access rules into OpenAPI security metadata. */
import type { JsonValue } from "../contracts/index.js";
import { problemSchema } from "./generate-response.js";
import type {
  FunctionNode,
  HttpGraphTrigger,
  OpenApiResponse,
  OpenApiSecurityScheme,
} from "./generate.types.js";

/** Name of the session security scheme in `components.securitySchemes`. */
export const SESSION_SECURITY = "session";

/** The Better Auth session cookie that protected operations require. */
export const SESSION_SECURITY_SCHEME: OpenApiSecurityScheme = {
  type: "apiKey",
  in: "cookie",
  name: "better-auth.session_token",
  description: "Better Auth session cookie set by signing in.",
};

/** What an operation adds for its route's `auth` and its function's `access` rule. */
export interface OperationSecurity {
  readonly security?: readonly Readonly<Record<string, readonly string[]>>[];
  readonly responses: Readonly<Record<string, OpenApiResponse>>;
  readonly relkit: { readonly auth?: "required"; readonly access?: JsonValue };
}

/** Describes the protection of one route.
 * @param trigger - HTTP route.
 * @param target - Its function, absent for raw handlers.
 * @returns The security requirement, the 401 and 403 problems, and `x-relkit` fields.
 * @example operationSecurity(trigger, target).security; // [{ session: [] }]
 */
export function operationSecurity(
  trigger: HttpGraphTrigger,
  target: FunctionNode | undefined,
): OperationSecurity {
  const required = trigger.config.auth?.kind === "required";
  const access = target?.access;
  if (!required && access === undefined) return { responses: {}, relkit: {} };
  return {
    security: [{ [SESSION_SECURITY]: [] }],
    responses: {
      "401": problem("No signed-in session"),
      ...(access === undefined
        ? {}
        : { "403": problem("The caller does not pass the access rule") }),
    },
    relkit: {
      ...(required ? { auth: "required" as const } : {}),
      ...(access === undefined ? {} : { access }),
    },
  };
}

function problem(description: string): OpenApiResponse {
  return { description, content: { "application/problem+json": { schema: problemSchema() } } };
}
