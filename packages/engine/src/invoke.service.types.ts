import type { invokeEffect } from "./invoke.js";

/** Invocation authority supplied by live or deterministic test Layers. */
export interface InvocationOperations {
  readonly invoke: typeof invokeEffect;
}
