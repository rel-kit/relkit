import { Context, Layer } from "effect";
import type { GraphInvocationIdentityService } from "./graph-runtime-identity.types.js";

/** Substitutable random source for graph invocation IDs.
 * @example Effect.provide(invokeGraphEffect(options), GraphInvocationIdentityLive);
 */
export class GraphInvocationIdentity extends Context.Service<
  GraphInvocationIdentity,
  GraphInvocationIdentityService
>()("relkit/agents/GraphInvocationIdentity") {}

/** Live graph invocation identity source.
 * @example Effect.runPromise(Effect.provide(invokeGraphEffect(options), GraphInvocationIdentityLive));
 */
export const GraphInvocationIdentityLive = Layer.succeed(GraphInvocationIdentity, {
  randomUUID: () => crypto.randomUUID(),
});
