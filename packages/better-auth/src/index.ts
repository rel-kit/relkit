import type { RawHttpHandler } from "@zsys/routes";

export const BETTER_AUTH_HANDLER = Symbol.for("zsys.better-auth.handler");

export interface BetterAuthLike<Session = unknown> {
  readonly handler: (request: Request) => Promise<Response>;
  readonly api: {
    readonly getSession: (options: { readonly headers: Headers }) => Promise<Session | null>;
  };
}

export interface BetterAuthRegistration<Session = unknown> {
  readonly kind: "better-auth";
  readonly auth: BetterAuthLike<Session>;
  readonly protected: readonly string[];
}

export type BetterAuthHandler<Session = unknown> = RawHttpHandler & {
  readonly [BETTER_AUTH_HANDLER]: BetterAuthRegistration<Session>;
};

export type InferBetterAuthSession<Handler> =
  Handler extends BetterAuthHandler<infer Session> ? Session : never;

export interface BetterAuthAdapterOptions {
  readonly protected?: readonly string[];
}

export function betterAuthAdapter<Session>(
  auth: BetterAuthLike<Session>,
  options: BetterAuthAdapterOptions = {},
): BetterAuthHandler<Session> {
  if (typeof auth?.handler !== "function" || typeof auth.api?.getSession !== "function") {
    throw new TypeError("betterAuthAdapter requires a Better Auth instance");
  }
  const protectedPaths = Object.freeze(
    [...new Set(options.protected ?? [])].map(validatePattern).sort(),
  );
  const handler = ((request: Request) => auth.handler(request)) as BetterAuthHandler<Session>;
  Object.defineProperty(handler, BETTER_AUTH_HANDLER, {
    value: Object.freeze({ kind: "better-auth", auth, protected: protectedPaths }),
    enumerable: false,
  });
  return Object.freeze(handler);
}

function validatePattern(value: string): string {
  if (!value.startsWith("/") || value.includes("?") || value.includes("#")) {
    throw new TypeError(`Invalid protected route pattern "${value}"`);
  }
  if (value.includes("*") && !value.endsWith("/*")) {
    throw new TypeError(`Protected route wildcard must end the pattern: "${value}"`);
  }
  return value;
}
