import type { JsonValue } from "relkit/contracts";
import type { NamedStreamFrame } from "relkit/contracts/jobs";
import type { JobStreamOptions } from "./stream.types.js";
/** Named stream acquisition, continuity and memory-bound ownership. */
export interface JobContentService {
  /** Acquires named content and transfers native cleanup to the returned iterator.
   * @typeParam Item - Declared JSON content payload.
   * @param client - Borrowed generated job transport.
   * @param job - Declared job key.
   * @param options - Existing stream identity, cursor, cancellation and bounds.
   * @returns Bounded frames once the native response is acquired, or the original native failure. */
  readonly open: <Item extends JsonValue = JsonValue>(
    client: unknown,
    job: string,
    options: JobStreamOptions,
  ) => Promise<AsyncIterable<NamedStreamFrame<Item>>>;
}
