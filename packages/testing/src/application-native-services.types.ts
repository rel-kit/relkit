/** Drizzle/Better Auth contracts reachable only through the selected testing helper. */
import type { activateBetterAuthService } from "@relkit/better-auth/drizzle";
import type { activateDrizzleService } from "@relkit/drizzle";
import type { DescriptorAny, SourceLocationError } from "@relkit/contracts";
import type { Effect } from "effect";

export type NativeDatabase = Awaited<ReturnType<typeof activateDrizzleService>>;
export type NativeAuth = Awaited<ReturnType<typeof activateBetterAuthService>>;
export type DatabaseDeclaration = Parameters<typeof activateDrizzleService>[0];
export type AuthDeclaration = Parameters<typeof activateBetterAuthService>[0];

/** Native dependencies substituted by test Layers without replacing ownership. */
export interface ApplicationServicesPlatform {
  readonly load: (
    root: string,
  ) => Effect.Effect<readonly DescriptorAny[], Error | SourceLocationError>;
  readonly database: typeof activateDrizzleService;
  readonly auth: typeof activateBetterAuthService;
}
