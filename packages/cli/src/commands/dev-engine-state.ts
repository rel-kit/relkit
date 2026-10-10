/**
 * Acquires session-local authority and coordination without opening listeners.
 * State is private to the engine's Scope; only selected native services are
 * captured, preserving the logger, tracer and request context of later calls.
 */
import { Context, Deferred, Effect, Queue, Ref, Scope, Semaphore } from "effect";
import { CliCleanup } from "../services/cleanup.service.js";
import { CliFileSystem } from "../services/filesystem.service.js";
import { CliDevSupervisor } from "../services/dev-supervisor.service.js";
import { CliSourceWatch } from "../services/source-watch.service.js";
import { CliPortProbe } from "./port-availability.service.js";
import { CliInspectorSupport } from "./dev-inspector-support.service.js";
import type { DevActivationRequest } from "./dev-session.types.js";
import type { DevEngineAuthorities, DevEngineState } from "./dev-engine-state.types.js";

/**
 * Creates synchronization primitives and captures the five native capabilities.
 * @returns Fresh state requiring the caller's session Scope and explicit authorities.
 */
export const acquireDevEngineState = Effect.fn("Dev.acquireState")(function* () {
  const scope = yield* Scope.Scope;
  const sdk = yield* CliDevSupervisor;
  const files = yield* CliFileSystem;
  const cleanup = yield* CliCleanup;
  const ports = yield* CliPortProbe;
  const sourceWatch = yield* CliSourceWatch;
  const support = yield* CliInspectorSupport;
  const context = Context.make(CliDevSupervisor, sdk).pipe(
    Context.add(CliFileSystem, files),
    Context.add(CliCleanup, cleanup),
    Context.add(CliPortProbe, ports),
    Context.add(CliSourceWatch, sourceWatch),
    Context.add(CliInspectorSupport, support),
  );
  return {
    scope,
    context,
    cleanup,
    queue: yield* Queue.make<DevActivationRequest>(),
    requested: yield* Deferred.make<void>(),
    closed: yield* Deferred.make<void>(),
    closing: yield* Ref.make(false),
    startup: yield* Semaphore.make(1),
    inspector: yield* Ref.make<import("effect").Fiber.Fiber<void> | undefined>(undefined),
  } satisfies DevEngineState;
});

/**
 * Supplies only the session's acquired native capabilities to lazy work.
 * @typeParam A - Original successful value.
 * @typeParam E - Original typed failure.
 * @typeParam R - Operation-specific requirements retained after native provisioning.
 * @param owner - Session-local native authority.
 * @param effect - Work that may require the captured native service set.
 * @returns Work with invocation-specific requirements and context preserved.
 */
export function provideDevEngine<A, E, R>(
  owner: DevEngineState,
  effect: Effect.Effect<A, E, R | DevEngineAuthorities>,
) {
  return effect.pipe(Effect.provideContext(owner.context));
}
