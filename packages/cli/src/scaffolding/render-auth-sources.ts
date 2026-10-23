/**
 * Renders native Better Auth declarations and the sole raw route mount. Layout
 * planning supplies the physical service path; source rendering performs no live
 * auth initialization and preserves borrowing of the native database owner.
 */
/**
 * Renders the native authentication service without executing user modules.
 * @returns TypeScript declaring an email/password Better Auth service with a local URL fallback.
 */
export function authServiceSource(): string {
  return `import { defineBetterAuthService } from "@relkit/better-auth";

export default defineBetterAuthService({
  baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",
  emailAndPassword: { enabled: true },
});
`;
}

/**
 * Renders auth Route Source as source text without executing user modules.
 * @param servicePath - Selected grouped or compatible flat auth boundary.
 * @returns TypeScript exporting the auth handler as an ALL route.
 */
export function authRouteSource(servicePath: string): string {
  return `import { defineRoute } from "@relkit/app/routes";
import auth from "@app/${servicePath.replace(/^src\//, "").replace(/\.ts$/, ".js")}";

export const ALL = defineRoute({ handler: auth.handler });
`;
}
