export function authServiceSource(): string {
  return `import { defineBetterAuthService } from "@relkit/better-auth";

export default defineBetterAuthService({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",
  emailAndPassword: { enabled: true },
});
`;
}

export function authRouteSource(): string {
  return `import { defineRoute } from "@relkit/app/routes";
import auth from "@app/auth/service.js";

export const ALL = defineRoute({ handler: auth.handler });
`;
}
