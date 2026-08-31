import { createDescriptorBase } from "@relkit/contracts";
import {
  drizzleRuntimeOf,
  type DrizzleActivation,
  type DrizzleServiceDescriptor,
} from "@relkit/drizzle/internal";
import { createUnboundIdentity } from "@relkit/invocation";
import type { RawHttpHandler } from "@relkit/routes";
import { betterAuth, type Auth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter, type DrizzleAdapterConfig } from "better-auth/adapters/drizzle";

export const BETTER_AUTH_HANDLER = Symbol.for("relkit.better-auth.handler");
const BETTER_AUTH_RUNTIME = Symbol.for("relkit.better-auth.runtime");

export type BetterAuthServiceOptions = Omit<BetterAuthOptions, "database" | "basePath"> & {
  readonly database?: never;
  readonly basePath?: never;
  readonly drizzle?: Omit<DrizzleAdapterConfig, "provider">;
};

export interface BetterAuthRegistration {
  readonly kind: "better-auth";
  readonly service: BetterAuthServiceDescriptor<any>;
}

export type BetterAuthHandler<Session = unknown> = RawHttpHandler & {
  readonly [BETTER_AUTH_HANDLER]: BetterAuthRegistration;
  readonly __session?: Session;
};

export type InferBetterAuthSession<Handler> =
  Handler extends BetterAuthHandler<infer Session> ? Session : never;

export interface BetterAuthServiceDescriptor<
  Options extends BetterAuthServiceOptions,
> extends ReturnType<typeof createDescriptorBase<"service", string>> {
  readonly capability: { readonly kind: "better-auth" };
  readonly handler: BetterAuthHandler<Auth<Options>["$Infer"]["Session"]>;
}

interface BetterAuthRuntime<Options extends BetterAuthServiceOptions> {
  readonly options: Options;
  activation: Promise<Auth<any>> | undefined;
}

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
  Object.defineProperty(descriptor, BETTER_AUTH_RUNTIME, { value: runtime });
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

function runtimeOf<Options extends BetterAuthServiceOptions>(
  service: BetterAuthServiceDescriptor<Options>,
): BetterAuthRuntime<Options> {
  const runtime = (service as unknown as Record<PropertyKey, unknown>)[BETTER_AUTH_RUNTIME];
  if (!isRecord(runtime)) throw new TypeError("Invalid Better Auth service descriptor");
  return runtime as unknown as BetterAuthRuntime<Options>;
}

function databaseServiceOf(
  activation: DrizzleActivation<DrizzleServiceDescriptor<any, any, any, any>>,
): DrizzleServiceDescriptor<any, any, any, any> {
  const service = (activation as unknown as Record<PropertyKey, unknown>)[
    Symbol.for("relkit.drizzle.service")
  ];
  if (!isRecord(service)) throw new TypeError("Drizzle activation is missing its service");
  return service as DrizzleServiceDescriptor<any, any, any, any>;
}

function validateBasePath(value: string): void {
  if (!value.startsWith("/") || value.endsWith("/") || value.includes("*") || value.includes("[")) {
    throw new TypeError(`Invalid Better Auth base path "${value}"`);
  }
}

function isRecord(value: unknown): value is Record<PropertyKey, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
