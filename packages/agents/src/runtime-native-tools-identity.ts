import { Context, Layer } from "effect";
import type { NativeToolIdentityService } from "./runtime-native-tools.types.js";

/** Substitutable native tool call identity source.
 * @example Effect.provide(createNativeToolsEffect(options, signal, 1024, id, trace), NativeToolIdentityLive);
 */
export class NativeToolIdentity extends Context.Service<NativeToolIdentity, NativeToolIdentityService>()(
  "relkit/agents/NativeToolIdentity",
) {}

/** Live UUID source for native tool calls.
 * @example Effect.runSync(Effect.provide(effect, NativeToolIdentityLive));
 */
export const NativeToolIdentityLive = Layer.succeed(NativeToolIdentity, NativeToolIdentity.of({
  randomUUID: () => crypto.randomUUID(),
}));
