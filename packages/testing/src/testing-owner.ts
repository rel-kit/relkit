import { Cause, Context, Effect, Exit, Layer, ManagedRuntime } from "effect";
import { createLoggerLayer, type LoggerOptions } from "@relkit/runtime-effect";

/**
 * Provisions redacting server logging once at a test helper's ownership boundary.
 * @param options Explicit sink and threshold overrides for this owner.
 * @returns The logger Layer inherited by its operations and children.
 * @see tests/fixtures/checked-examples.ts deterministicServicesExample for checked provisioning.
 */
export function testingLoggerLayer(options?: LoggerOptions): Layer.Layer<never> {
  return createLoggerLayer(options ?? { component: "testing", human: false, json: false });
}

/**
 * Releases an existing owner while retaining native failure identity.
 * @typeParam R The services owned by this runtime.
 * @typeParam E The acquisition failure supplied by its Layer.
 * @param owner Runtime allocated once for the public helper.
 * @returns Completion after all registered finalizers finish.
 * @see tests/fixtures/checked-examples.ts deterministicServicesExample for checked ownership.
 */
export async function disposeTestingOwner<R, E>(
  owner: ManagedRuntime.ManagedRuntime<R, E>,
): Promise<void> {
  const exit = await Effect.runPromiseExit(owner.disposeEffect);
  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
}

/**
 * Reads retained, resource-free state using the owner's captured observation context.
 * @typeParam A Native query result.
 * @param context Context captured once while the owner was active.
 * @param query Query over retained in-memory state; it must not acquire new resources.
 * @returns The native result or original rejection identity after owner close.
 */
export async function runRetainedTestingQuery<A>(
  context: Context.Context<never>,
  query: Effect.Effect<A, unknown>,
): Promise<A> {
  const exit = await Effect.runPromiseExit(Effect.provide(query, context));
  if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
  return exit.value;
}
