import type { Effect } from "effect";
import type { InvocationIdSource } from "@relkit/engine";
import type { ProtocolId } from "@relkit/contracts";

/** Deterministic identity allocation authority shared by one test owner. */
export interface TestIdentityService {
  readonly next: (kind: Parameters<InvocationIdSource["next"]>[0]) => Effect.Effect<ProtocolId>;
}
