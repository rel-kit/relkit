import { createDescriptorBase } from "@relkit/contracts";
import {
  drizzleRuntimeOf,
  type DrizzleActivation,
  type DrizzleServiceDescriptor,
} from "@relkit/drizzle/internal";
import { createUnboundIdentity } from "@relkit/invocation";
import { betterAuth, type Auth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { BETTER_AUTH_HANDLER, attachRuntime, databaseServiceOf, runtimeOf } from "./runtime.js";
import type { BetterAuthRuntime } from "./runtime.js";
import type {
  BetterAuthHandler,
  BetterAuthServiceDescriptor,
  BetterAuthServiceOptions,
} from "./types.js";
import { validateBasePath } from "./validation.js";

/**
 * Defines a lazy Better Auth domain service using the application's Drizzle database.
 *
 * Mount `handler` with a filesystem `ALL` catch-all route. RELKIT supplies `database`
 * and derives `basePath` from that route; neither option can be set here. Other
 * options follow Better Auth, with optional `drizzle` adapter settings. The
 * descriptor is not the native auth instance and does not expose `auth.api`.
 * Supply BETTER_AUTH_SECRET through the server process environment before startup.
 *
 * @example
 * ```ts
 * import { defineBetterAuthService } from "@relkit/better-auth"
 *
 * const auth = defineBetterAuthService({
 *   baseURL: "http://127.0.0.1:3000",
 *   emailAndPassword: { enabled: true },
 * })
 * const handler = auth.handler
 * ```
 * @category Services
 * @since 0.0.5
 */
export function defineBetterAuthService<const Options extends BetterAuthServiceOptions>(
  options: Options,
): BetterAuthServiceDescriptor<Options> {
  if (!isRecord(options)) throw new TypeError("Better Auth service options must be an object");
  if (Object.hasOwn(options, "database")) {
    throw new TypeError("Better Auth service database is provided by the Drizzle service");
  }
  if (Object.hasOwn(options, "basePath")) {
    throw new TypeError("Better Auth basePath is derived from its ALL route");
  }
  const runtime: BetterAuthRuntime<Options> = { options, activation: undefined };
  const handler = (async (request: Request) => {
    const auth = await runtime.activation;
    if (auth === undefined) return new Response("Service Unavailable", { status: 503 });
    return auth.handler(request);
  }) as BetterAuthHandler<Auth<Options>["$Infer"]["Session"]>;
  const descriptor = {
    ...createDescriptorBase("service", createUnboundIdentity()),
    capability: Object.freeze({ kind: "better-auth" as const }),
    handler,
  };
  Object.defineProperty(handler, BETTER_AUTH_HANDLER, {
    value: Object.freeze({ kind: "better-auth", service: descriptor }),
  });
  attachRuntime(descriptor as BetterAuthServiceDescriptor<Options>, runtime);
  Object.freeze(handler);
  return Object.freeze(descriptor) as BetterAuthServiceDescriptor<Options>;
}

export async function activateBetterAuthService<
  Options extends BetterAuthServiceOptions,
  Database extends DrizzleServiceDescriptor<any, any, any, any>,
>(
  service: BetterAuthServiceDescriptor<Options>,
  database: DrizzleActivation<Database>,
  basePath: string,
): Promise<Auth<any>> {
  const runtime = runtimeOf(service);
  if (runtime.activation !== undefined) return runtime.activation;
  validateBasePath(basePath);
  runtime.activation = Promise.resolve().then(() => {
    const drizzle = drizzleRuntimeOf(databaseServiceOf(database));
    const { drizzle: adapterOptions, ...options } = runtime.options;
    return betterAuth({
      ...options,
      basePath,
      database: drizzleAdapter(database.client, {
        ...(adapterOptions ?? {}),
        schema: adapterOptions?.schema ?? drizzle.schema,
        provider: drizzle.dialect,
      }),
    });
  });
  runtime.activation.catch(() => {
    runtime.activation = undefined;
  });
  return runtime.activation;
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
