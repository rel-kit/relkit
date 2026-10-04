import type { activateBetterAuthService } from "@relkit/better-auth";
import type { activateDrizzleService } from "@relkit/drizzle";
import type { HttpAuthRuntime } from "@relkit/runtime-hono";

/** Acquired owner-specific database and auth authorities with complete cleanup. */
export interface TestApplicationServices {
  readonly context: Readonly<Record<string, unknown>>;
  readonly auth?: HttpAuthRuntime;
  readonly authHandler?: (request: Request) => Promise<Response>;
  readonly close: () => Promise<void>;
}

/** Native activation boundaries replaced by test Layers for partial-acquisition checks. */
export interface ApplicationServicesPlatform {
  readonly load: (root: string) => Promise<readonly Record<string, unknown>[]>;
  readonly database: typeof activateDrizzleService;
  readonly auth: typeof activateBetterAuthService;
}
