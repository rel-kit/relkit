/** Describes the concrete file content, mode and checked lookup shared by one isolated scaffolding filesystem fixture; all service methods receive the same request-owned Ref. */

import type { Effect, Ref } from "effect";
import type { GeneratorIoError } from "create-relkit/internal/generator-errors";

/** Stored text and native permission bits, copied when the fixture updates its Map. */
export interface MemoryFileValue {
  readonly content: string;
  readonly mode: number;
}

/** Mutable request-local authority; assertion snapshots are detached Map copies. */
export type MemoryFileState = Ref.Ref<Map<string, MemoryFileValue>>;

/** Lookup retaining the original missing-file diagnostic and lazy Effect boundary. */
export type RequiredFile = (path: string) => Effect.Effect<MemoryFileValue, GeneratorIoError>;
