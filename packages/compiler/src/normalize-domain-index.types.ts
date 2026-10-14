/**
 * Records invocation-owned service/public-member indexes. These maps are not
 * runtime resources or process singletons; normalization constructs them after
 * assigning ownership and uses them for exposure and dependency validation.
 */
import type { NormalizedDescriptor } from "./normalize-types.js";

/** Resolved public service values and kind-qualified public member identities. */
export interface DomainMemberIndex {
  readonly services: ReadonlyMap<string, NormalizedDescriptor>;
  readonly publicIds: ReadonlySet<string>;
}
