/** Native test substitutions retain the exact live operation error/requirement contracts. */
import type { DevTelemetryEffects } from "../../src/commands/dev-telemetry.types.js";
import type { HttpCapabilities } from "../../src/services/http.types.js";
import type { DevLog } from "../../src/commands/dev.types.js";

/** Optional controlled operation boundaries; the owning test still supplies its Scope. */
export interface TelemetryRelayFixtureOptions {
  readonly configure?: DevTelemetryEffects["configureEffect"];
  readonly request?: HttpCapabilities["request"];
  readonly append?: DevTelemetryEffects["append"];
  readonly log?: DevLog;
}
