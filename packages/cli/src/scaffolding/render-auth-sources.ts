/**
 * Renders the application's plain Better Auth file and the service that serves it. RelKit adds
 * the database and mounts the handler, so no route file is rendered. Source rendering performs no
 * live auth initialization.
 */
/**
 * Renders the Better Auth file: the instance the application configures with Better Auth's own API.
 * @param basePath - Mount point selected for the auth endpoints.
 * @returns TypeScript exporting an email/password Better Auth instance.
 */
export function betterAuthFileSource(basePath: string): string {
  return `import { betterAuth } from "better-auth";

export const auth = betterAuth({
  // The server refuses to start without BETTER_AUTH_URL; the fallback only serves \`relkit check\`.
  baseURL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",${basePath === "/api/auth" ? "" : `\n  basePath: ${JSON.stringify(basePath)},`}
  emailAndPassword: { enabled: true },
});
`;
}

/**
 * Renders the auth service over the Better Auth file next to it.
 * @returns TypeScript declaring the service RelKit mounts at the instance's base path.
 */
export function authServiceSource(): string {
  return `import { defineBetterAuthService } from "@relkit/better-auth";
import { auth } from "./better-auth.js";

export default defineBetterAuthService({ auth });
`;
}
