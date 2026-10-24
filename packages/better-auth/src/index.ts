/** Lazy authentication authoring; select /drizzle for native database activation. @packageDocumentation */
import { createDescriptorBase } from "@relkit/contracts";
import { createUnboundIdentity } from "@relkit/invocation";
import type { Auth } from "better-auth";
import type {
  BetterAuthHandler,
  BetterAuthDeclarationRuntime,
  BetterAuthServiceDescriptor,
  BetterAuthServiceOptions,
} from "./declaration.types.js";
import { BETTER_AUTH_HANDLER, BETTER_AUTH_RUNTIME } from "./symbols.js";

export { BETTER_AUTH_HANDLER };
export type {
  BetterAuthServiceOptions,
  BetterAuthRegistration,
  BetterAuthHandler,
  InferBetterAuthSession,
  BetterAuthServiceDescriptor,
} from "./declaration.types.js";

/**
 * Defines lazy authentication using the application's Drizzle database.
 * @typeParam Options - Native options retaining session and plugin inference.
 * @param options - Native SDK configuration plus optional Drizzle adapter settings.
 * @returns A frozen declaration and stable handler; inactive handlers return 503.
 * @remarks Mount handler in a filesystem ALL catch-all route. RELKIT supplies
 * database and basePath. Declaration and compilation never construct native auth.
 * Supply BETTER_AUTH_SECRET in the server environment before activation.
 * @throws TypeError When options is not an object or specifies database/basePath.
 * @example
 * ```ts
 * import { defineBetterAuthService } from "@relkit/better-auth";
 * const auth = defineBetterAuthService({
 *   baseURL: "http://127.0.0.1:3000",
 *   emailAndPassword: { enabled: true },
 * });
 * const handler = auth.handler;
 * ```
 * @category Services
 * @since 0.0.5
 */
export function defineBetterAuthService<const Options extends BetterAuthServiceOptions>(
  options: Options,
): BetterAuthServiceDescriptor<Options> {
  if (options === null || typeof options !== "object" || Array.isArray(options))
    throw new TypeError("Better Auth service options must be an object");
  if (Object.hasOwn(options, "database"))
    throw new TypeError("Better Auth service database is provided by the Drizzle service");
  if (Object.hasOwn(options, "basePath"))
    throw new TypeError("Better Auth basePath is derived from its ALL route");
  const runtime: BetterAuthDeclarationRuntime<Options> = {
    options,
    activation: undefined,
    handle: undefined,
  };
  const handler = (async (request: Request) => {
    return runtime.handle === undefined
      ? new Response("Service Unavailable", { status: 503 })
      : runtime.handle(request);
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
