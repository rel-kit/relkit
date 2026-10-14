/** Native application service ownership and replaceable activation dependencies. */
import type { activateBetterAuthService } from "@relkit/better-auth";
import type { activateDrizzleService } from "@relkit/drizzle";
import type { DescriptorAny, SourceLocationError } from "@relkit/contracts";
import type { Effect } from "effect";
import type { HttpAuthRuntime } from "@relkit/runtime-hono";

export type NativeDatabase = Awaited<ReturnType<typeof activateDrizzleService>>;
export type NativeAuth = Awaited<ReturnType<typeof activateBetterAuthService>>;
export type DatabaseDeclaration = Parameters<typeof activateDrizzleService>[0];
export type AuthDeclaration = Parameters<typeof activateBetterAuthService>[0];
export type ServiceEnvironment = Parameters<typeof activateDrizzleService>[1];

/** Acquired owner-specific authorities; auth borrows the sole database. */
export interface TestApplicationServices {
  readonly context: { readonly database?: NativeDatabase["context"] };
  readonly auth?: HttpAuthRuntime;
  readonly authHandler?: (request: Request) => Promise<Response>;
  readonly close: () => Promise<void>;
}

/** Native dependencies substituted by test Layers without replacing ownership. */
export interface ApplicationServicesPlatform {
  readonly load: (
    root: string,
  ) => Effect.Effect<readonly DescriptorAny[], Error | SourceLocationError>;
  readonly database: typeof activateDrizzleService;
  readonly auth: typeof activateBetterAuthService;
}
