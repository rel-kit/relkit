import type { Latch, Ref } from "effect";

/** Effect-owned ephemeral lease with a drain barrier for retained descendants. */
export interface NativeLease {
  readonly key: object;
  readonly state: Ref.Ref<{
    readonly accepting: boolean;
    readonly closing: boolean;
    readonly borrowers: number;
  }>;
  readonly drained: Latch.Latch;
}

/** Native transport for exact owner and physical client capabilities. */
export interface NativeLeaseContext {
  readonly owner?: NativeLease;
  readonly sqlite?: NativeLease;
}
