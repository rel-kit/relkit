/** Authored native SDK acceptance callback; resource ownership is explicit and native lease context is retained. */
export const probeNestedAuthSource = `/** Native nested auth callback preserves the current database admission lease without starting a second Effect runtime. */
import { activateDrizzleService } from "@relkit/drizzle";
import { activateBetterAuthService, defineBetterAuthService } from "@relkit/better-auth";
import database from "./service.js";
/**
 * Acquires nested auth inside native admitted work while borrowing the host's owner.
 * @param databasePath - Explicit native database path.
 * @returns Whether native auth factories initialized and answered session queries.
 */
export async function probeNestedAuth(databasePath: string): Promise<boolean> {
  const active = await activateDrizzleService(database, { DATABASE_PATH: databasePath });
  const options = { baseURL: "http://localhost", secret: "nested-fixture-secret-at-least-32-bytes" };
  const secondary = defineBetterAuthService(options);
  let initialized = false;
  const primary = defineBetterAuthService({ ...options, plugins: [{
    id: "nested-auth", init: async () => {
      const child = await activateBetterAuthService(secondary, active, "/api/secondary");
      initialized = (await child.api.getSession({ headers: new Headers() })) === null;
    },
  }] });
  const acquired = await active.context.transaction(() =>
    activateBetterAuthService(primary, active, "/api/nested"));
  return initialized && (await acquired.api.getSession({ headers: new Headers() })) === null;
}
`;
