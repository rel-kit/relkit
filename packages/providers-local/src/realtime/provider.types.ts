import type { RealtimeProvider } from "@relkit/realtime";
import type { Effect } from "effect";
import type { LocalOperationError } from "../local-effect.js";

/** Polling configuration for filesystem-shared realtime observations. */
export interface LocalRealtimeProviderOptions {
  readonly pollingMs?: number;
}

/** Effect methods corresponding to the established realtime provider surface. */
export type RealtimeEffects = {
  readonly [K in Exclude<keyof RealtimeProvider, "capabilities">]: RealtimeProvider[K] extends (
    ...args: infer A
  ) => infer R
    ? (...args: A) => Effect.Effect<Awaited<R>, LocalOperationError>
    : never;
};
