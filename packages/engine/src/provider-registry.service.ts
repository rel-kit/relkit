import { observeExecution } from "@relkit/runtime-effect";
import { Context, Effect, Exit, Layer, Ref, Scope } from "effect";
import { enginePromise, engineTry, runEnginePromise, runEngineSync } from "./engine-runtime.js";
import { validateModelReadiness } from "./model-readiness.js";
import {
  configurationFor,
  create,
  issue,
  ready,
  validateOptions,
  validateRuntimeValue,
} from "./provider-registry-lifecycle.js";
import type {
  ProviderCapability,
  ProviderHandle,
  ProviderRegistryOptions,
  ProviderRequirement,
} from "./provider-registry-types.js";
import { ProviderRegistryError } from "./provider-registry-types.js";
import {
  collectRegistrations,
  collectRequirements,
  key,
  registrationFor,
  replacementFor,
} from "./provider-registry-validation.js";
import type { ProviderRegistryOperations } from "./provider-registry.service.types.js";

/** Scoped provider acquisition contract. Live and test layers share this authority.
 * @example
 * ```ts
 * // Given verified `options: ProviderRegistryOptions`:
 * const program = Effect.scoped(Effect.gen(function* () {
 *   const providers = yield* ProviderRegistryService;
 *   return (yield* providers.acquire(options)).requirements.length;
 * })).pipe(Effect.provide(ProviderRegistryLive));
 * await Effect.runPromise(program);
 * ```
 */
export class ProviderRegistryService extends Context.Service<
  ProviderRegistryService,
  ProviderRegistryOperations
>()("@relkit/engine/ProviderRegistry") {}

/** Acquire sorted providers and register each release before validating readiness.
 * @param options - Generation configuration and explicit runtime integrations.
 * @returns A lazy scoped registry operation; startup failures retain public codes.
 * @remarks Requires Scope. The caller owns the registry until scope closure or release.
 * @see {@link ProviderRegistryService} for a complete provisioning example.
 */
export const acquireProviderRegistry = Effect.fn("Engine.providers.acquire")(
  function* (options: ProviderRegistryOptions) {
    yield* engineTry(() => validateOptions(options));
    const requirements = yield* engineTry(() => collectRequirements(options.graph));
    const registrations = yield* engineTry(() =>
      collectRegistrations(options.runtimeIntegrationModules),
    );
    const owner = yield* Scope.fork(yield* Scope.Scope, "sequential");
    const releaseFailed = yield* Ref.make(false);
    const released = yield* Ref.make(false);
    const handles: Record<string, ProviderHandle> = {};
    yield* Effect.forEach(
      requirements,
      (requirement) =>
        Effect.gen(function* () {
          const generation = yield* Effect.acquireRelease(
            Effect.gen(function* () {
              const replacement = replacementFor(options.replacements, requirement);
              if (replacement !== undefined) return replacement;
              const registration = yield* engineTry(() =>
                registrationFor(registrations, requirement.binding),
              );
              const configuration = yield* engineTry(() => configurationFor(requirement, options));
              return yield* enginePromise((signal) =>
                create(registration, requirement, configuration, {
                  ...options,
                  signal:
                    options.signal === undefined
                      ? signal
                      : AbortSignal.any([signal, options.signal]),
                }),
              );
            }),
            (generation) =>
              enginePromise(() =>
                Promise.resolve(generation.release ? generation.release() : generation.dispose?.()),
              ).pipe(
                Effect.catch(() =>
                  Effect.gen(function* () {
                    yield* Ref.set(releaseFailed, true);
                    yield* Effect.logError("Provider release failed", {
                      code: "RELKIT_PROVIDER_RELEASE_FAILED",
                    });
                  }),
                ),
              ),
          );
          yield* engineTry(() => validateRuntimeValue(generation.value, requirement));
          yield* enginePromise((signal) =>
            ready(
              generation,
              requirement,
              options.signal === undefined ? signal : AbortSignal.any([signal, options.signal]),
            ),
          );
          handles[key(requirement.capability, requirement.profile)] = Object.freeze({
            capability: requirement.capability,
            profile: requirement.profile,
            binding: requirement.binding,
            value: generation.value,
          });
        }).pipe(Effect.mapError((cause) => constructionFailure(cause, requirement))),
      { discard: true },
    ).pipe(Effect.provideService(Scope.Scope, owner));
    yield* engineTry(() =>
      validateModelReadiness(options.graph, (profile) => handles[key("model", profile)]?.value),
    );
    /** Close this registry's child scope once and report any provider cleanup failure.
     * @returns An observed release effect preserving the public release error code.
     */
    const releaseEffect = Effect.fn("Engine.providers.release")(() =>
      observeExecution(
        "engine",
        "providers.release",
        Effect.gen(function* () {
          if (yield* Ref.getAndSet(released, true)) return;
          yield* Scope.close(owner, Exit.void);
          if (yield* Ref.get(releaseFailed))
            return yield* Effect.fail(
              issue("RELKIT_PROVIDER_RELEASE_FAILED", undefined, "Provider release failed."),
            );
        }),
      ),
    );
    /** Run the registry's idempotent release at its native Promise boundary.
     * @returns A Promise settling after registered provider releases complete.
     */
    const release = () => runEnginePromise(releaseEffect());
    const frozen = Object.freeze(handles);
    return Object.freeze({
      generationId: options.generationId,
      requirements: Object.freeze(requirements),
      handles: frozen,
      get: (capability: ProviderCapability, profile: string) => frozen[key(capability, profile)],
      resolve: (capability: ProviderCapability, profile: string) =>
        runEngineSync(
          observeExecution(
            "engine",
            "providers.resolve",
            engineTry(() => {
              const handle = frozen[key(capability, profile)];
              if (handle !== undefined) return handle;
              throw issue(
                "RELKIT_PROVIDER_PROFILE_UNKNOWN",
                undefined,
                `Provider binding "${capability}.${profile}" is not available.`,
              );
            }),
          ),
        ),
      release,
      dispose: release,
    });
  },
  (effect) => observeExecution("engine", "providers.acquire", effect),
);

/** Live registry operations; resources are acquired in the calling generation scope. */
export const ProviderRegistryLive = Layer.effect(
  ProviderRegistryService,
  Effect.gen(function* () {
    return ProviderRegistryService.of({ acquire: acquireProviderRegistry });
  }),
);

/** Redact unknown integration failures at the owning boundary.
 * @param cause - Original native failure.
 * @param requirement - Binding being acquired.
 * @returns The original public issue or a safe construction failure.
 */
function constructionFailure(
  cause: unknown,
  requirement: ProviderRequirement,
): ProviderRegistryError {
  return cause instanceof ProviderRegistryError
    ? cause
    : issue(
        "RELKIT_PROVIDER_CONSTRUCTION_FAILED",
        requirement,
        `Provider construction failed for binding "${requirement.bindingId}".`,
      );
}
