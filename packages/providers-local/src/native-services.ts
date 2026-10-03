import { Clock, Context, Random } from "effect";
import { currentNativeEffectContext } from "@relkit/runtime-effect";

/**
 * Reads the owning Effect Clock from a synchronous native compatibility helper.
 * @returns Milliseconds from the caller's clock, or the platform clock outside Effect.
 */
export function nativeNow(): number {
  const context = currentNativeEffectContext();
  return context === undefined
    ? Date.now()
    : Context.get(context, Clock.Clock).currentTimeMillisUnsafe();
}

/**
 * Reads retry jitter from the caller's replaceable Effect random service.
 * @returns A value in [0, 1); cryptographic identifiers continue using node:crypto.
 */
export function nativeRandom(): number {
  const context = currentNativeEffectContext();
  return context === undefined
    ? Math.random()
    : Context.get(context, Random.Random).nextDoubleUnsafe();
}
