/** Lazy authentication authoring; select /drizzle for native database activation. @packageDocumentation */
import { createDescriptorBase } from "relkit/contracts";
import { deprecated } from "relkit/diagnostics";
import { createUnboundIdentity } from "relkit/invocation";
import type {
  BetterAuthHandler,
  BetterAuthDeclarationRuntime,
  BetterAuthInstance,
  BetterAuthInstanceServiceOptions,
  BetterAuthServiceDescriptor,
  BetterAuthServiceOptions,
} from "./declaration.types.js";
import { BETTER_AUTH_HANDLER, BETTER_AUTH_RUNTIME } from "./symbols.js";

export { BETTER_AUTH_HANDLER };
export type {
  BetterAuthInstance,
  BetterAuthInstanceServiceOptions,
  BetterAuthServiceOptions,
  BetterAuthRegistration,
  BetterAuthHandler,
  InferBetterAuthSession,
  BetterAuthServiceDescriptor,
} from "./declaration.types.js";

/** Default mount point when the instance sets no `basePath`. */
const DEFAULT_BASE_PATH = "/api/auth";

/**
 * Defines the authentication service from the application's own Better Auth instance.
 * @typeParam Instance - The instance; its options type the session.
 * @param options - The instance, and `mount: false` to skip mounting its handler.
 * @returns A frozen declaration and stable handler; inactive handlers return 503.
 * @remarks Write `export const auth = betterAuth({...})` in a Better Auth file and pass it here.
 * When the server starts, RelKit rebuilds the instance from `auth.options`, adding the Drizzle
 * service's adapter when `database` is unset and `/api/auth` when `basePath` is unset, and mounts
 * the handler at `basePath` unless `mount` is `false`. Importing the file during `relkit check`
 * stays offline: without a database Better Auth uses an in-memory adapter.
 * @example
 * ```ts
 * import { betterAuth } from "better-auth";
 * import { defineBetterAuthService } from "@relkit/better-auth";
 * export const auth = betterAuth({ emailAndPassword: { enabled: true } });
 * export default defineBetterAuthService({ auth });
 * ```
 * @category Services
 * @since 0.9.0
 */
export function defineBetterAuthService<const Instance extends BetterAuthInstance>(
  options: BetterAuthInstanceServiceOptions<Instance>,
): BetterAuthServiceDescriptor<BetterAuthServiceOptions, Instance["$Infer"]["Session"]>;
/**
 * Defines lazy authentication from Better Auth options, using the application's Drizzle database.
 * @deprecated Write a Better Auth file and pass its instance as `defineBetterAuthService({ auth })`.
 * @typeParam Options - Native options retaining session and plugin inference.
 * @param options - Native SDK configuration plus optional Drizzle adapter settings.
 * @returns A frozen declaration and stable handler; inactive handlers return 503.
 * @throws TypeError When options is not an object or specifies database/basePath.
 * @category Services
 * @since 0.0.5
 */
export function defineBetterAuthService<const Options extends BetterAuthServiceOptions>(
  options: Options,
): BetterAuthServiceDescriptor<Options>;
export function defineBetterAuthService(
  options: BetterAuthServiceOptions | BetterAuthInstanceServiceOptions<BetterAuthInstance>,
): BetterAuthServiceDescriptor<BetterAuthServiceOptions, unknown> {
  if (options === null || typeof options !== "object" || Array.isArray(options))
    throw new TypeError("Better Auth service options must be an object");
  const instance = instanceOf(options);
  if (instance === undefined) {
    deprecated(
      "RELKIT_DEPRECATED_BETTER_AUTH_OPTIONS",
      "a Better Auth file passed as `defineBetterAuthService({ auth })`",
    );
    if (Object.hasOwn(options, "database"))
      throw new TypeError("Better Auth service database is provided by the Drizzle service");
    if (Object.hasOwn(options, "basePath"))
      throw new TypeError("Better Auth basePath is derived from its ALL route");
  }
  const native = instance?.auth.options;
  const runtime: BetterAuthDeclarationRuntime<BetterAuthServiceOptions> = {
    options: native ?? (options as BetterAuthServiceOptions),
    activation: undefined,
    handle: undefined,
  };
  const handler = (async (request: Request) => {
    return runtime.handle === undefined
      ? new Response("Service Unavailable", { status: 503 })
      : runtime.handle(request);
  }) as BetterAuthHandler<unknown>;
  const capability =
    instance === undefined
      ? { kind: "better-auth" as const }
      : {
          kind: "better-auth" as const,
          basePath: native?.basePath ?? DEFAULT_BASE_PATH,
          mount: instance.mount !== false,
          database: native?.database === undefined ? ("drizzle" as const) : ("custom" as const),
        };
  const descriptor = {
    ...createDescriptorBase("service", createUnboundIdentity()),
    capability: Object.freeze(capability),
    handler,
  };
  Object.defineProperty(handler, BETTER_AUTH_HANDLER, {
    value: Object.freeze({ kind: "better-auth", service: descriptor }),
  });
  Object.defineProperty(descriptor, BETTER_AUTH_RUNTIME, { value: runtime });
  Object.freeze(handler);
  return Object.freeze(descriptor) as BetterAuthServiceDescriptor<
    BetterAuthServiceOptions,
    unknown
  >;
}

/** Recognizes `{ auth }` holding a Better Auth instance, as opposed to native options. */
function instanceOf(
  options: object,
): BetterAuthInstanceServiceOptions<BetterAuthInstance> | undefined {
  const auth: unknown = Reflect.get(options, "auth");
  if (auth === null || typeof auth !== "object") return undefined;
  if (!("options" in auth) || !("handler" in auth) || typeof auth.handler !== "function")
    throw new TypeError(
      "defineBetterAuthService({ auth }) needs the instance returned by betterAuth()",
    );
  for (const key of Object.keys(options))
    if (key !== "auth" && key !== "mount")
      throw new TypeError(
        `Unknown Better Auth service option "${key}"; configure Better Auth in its own file.`,
      );
  if (Reflect.get(options, "mount") !== undefined && Reflect.get(options, "mount") !== false)
    throw new TypeError("Better Auth service mount must be false when set");
  return options as BetterAuthInstanceServiceOptions<BetterAuthInstance>;
}
