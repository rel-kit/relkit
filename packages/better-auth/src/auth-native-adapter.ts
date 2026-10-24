/** Projects native SDK callables through the existing admitted auth service. */
import type { Auth } from "better-auth";
import { Effect } from "effect";
import { AuthService } from "./auth.service.js";
import { runAuthPromise } from "./auth-run.js";
import type { BetterAuthRuntime, BetterAuthServiceOptions } from "./auth.types.js";

/**
 * Routes native callables through admission while preserving native properties.
 * @param owner - Managed owner reused by each Promise boundary.
 * @param native - SDK instance with initialization complete.
 * @returns Stable proxy retaining native object and function metadata.
 * @remarks Handler, fetch and API calls are admitted. The native $context is
 * retained as an advanced SDK view; direct adapter access requires its DB owner's
 * lifetime rather than establishing a new admission lease.
 * @internal
 */
export function authNativeAdapter(
  owner: BetterAuthRuntime<BetterAuthServiceOptions>["activation"] & {},
  native: Auth<any>,
): Auth<any> {
  const cached = nativeAdapters.get(owner);
  if (cached !== undefined) return cached;
  const methods = new Map<PropertyKey, unknown>();
  const handler = (request: Request) =>
    runAuthPromise(
      owner,
      Effect.flatMap(AuthService, (auth) => auth.handler(request)),
      { signal: request.signal },
      "auth.handler",
    );
  const api = new Proxy(native.api, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      if (typeof value !== "function" || typeof key !== "string") return value;
      if (!methods.has(key))
        methods.set(
          key,
          new Proxy(value, {
            apply(_method, _receiver, args) {
              return runAuthPromise(
                owner,
                Effect.flatMap(AuthService, (auth) => auth.api(key, args)),
                undefined,
                key === "getSession" ? "auth.session" : "auth.api",
              );
            },
          }),
        );
      return methods.get(key);
    },
  });
  const adapter = new Proxy(native, {
    get(target, key, receiver) {
      if (key === "handler" || key === "fetch") return handler;
      return key === "api" ? api : Reflect.get(target, key, receiver);
    },
  });
  nativeAdapters.set(owner, adapter);
  return adapter;
}

// Owners retain native auth already; this weak projection cache adds no lifetime.
const nativeAdapters = new WeakMap<object, Auth<any>>();
