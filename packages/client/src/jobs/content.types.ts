import type { JsonValue } from "@relkit/contracts";
import type { NamedStreamFrame } from "@relkit/contracts/jobs";
import type { Effect } from "effect";
import type { JobStreamOptions } from "./stream.types.js";
/** Named stream acquisition, continuity and memory-bound ownership. */
export interface JobContentService {
  /** Acquires named content and transfers native cleanup to the returned iterator.
   * @param client - Borrowed generated job transport.
   * @param job - Declared job key.
   * @param options - Existing stream identity, cursor, cancellation and bounds.
   * @returns Lazy acquisition of bounded frames or the original native failure. */
  readonly open: (
    client: unknown,
    job: string,
    options: JobStreamOptions,
  ) => Effect.Effect<AsyncIterable<NamedStreamFrame<JsonValue>>, unknown>;
}
