/** Authored native SDK acceptance callback; resource ownership is explicit and native lease context is retained. */
export const lifecycleSource = `/** Native SDK callbacks retain their admitted lease context; the Effect entrypoint owns the outer test scope. */
import { activateDrizzleService, defineDrizzleService, type ApplicationEnv } from "@relkit/drizzle";
import { activateBetterAuthService } from "@relkit/better-auth";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import database from "./service.js";
import * as schema from "./schema/index.js";
import auth from "@app/services/auth/service.js";
export { probeDescendants } from "./probe-descendants.js";
export { probeNestedAuth } from "./probe-nested-auth.js";

/**
 * Uses native SDK lease inheritance while owning isolated acquisitions.
 * @param context - Borrowed context object compared only by identity.
 * @param env - Explicit native environment.
 * @returns Ownership and retry observations after isolated clients close.
 */
export async function probeLifecycle(context: object, env: ApplicationEnv): Promise<{
  shared: boolean; isolated: boolean; recovered: boolean;
}> {
  const shared = await activateDrizzleService(database, env);
  const again = await activateDrizzleService(database, { DATABASE_PATH: "ignored.sqlite" });
  const isolated = await activateDrizzleService(database, env, { isolated: true });
  try {
    const sharedAuth = await activateBetterAuthService(auth, shared, "/api/auth");
    const isolatedAuth = await activateBetterAuthService(auth, isolated, "/api/auth", { isolated: true });
    return {
      shared: shared === again && shared.context === context,
      isolated: isolated !== shared && isolatedAuth !== sharedAuth,
      recovered: await probeRecovery(env),
    };
  } finally { await isolated.close(); }
}

/**
 * Proves a failed native client factory can be retried without cached failure.
 * @param env - Explicit SQLite path.
 * @returns Whether retry succeeded after the injected expected failure.
 */
async function probeRecovery(env: ApplicationEnv): Promise<boolean> {
  let attempts = 0;
  const retry = defineDrizzleService({
    schema,
    client: context => {
      if (++attempts === 1) throw new Error("fixture acquisition failure");
      return drizzle({ client: new Database(String(context.env.DATABASE_PATH)) });
    },
    dispose: client => client.$client.close(),
  });
  let failed = false;
  try { await activateDrizzleService(retry, env); }
  catch (error) {
    if (!(error instanceof Error) || error.message !== "fixture acquisition failure") throw error;
    failed = true;
  }
  const recovered = await activateDrizzleService(retry, env);
  try { return failed && attempts === 2; } finally { await recovered.close(); }
}
`;
