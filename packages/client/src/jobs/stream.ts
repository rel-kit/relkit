import type { JsonValue } from "@relkit/contracts";
import type { NamedStreamFrame } from "@relkit/contracts/jobs";
import { runExecutionPromise, runExecutionSync } from "@relkit/contracts/operation";
import { ManagedRuntime } from "effect";
import { JobContent, JobContentLive } from "./content.service.js";
import type { JobStreamOptions } from "./stream.types.js";
export type { JobStreamOptions } from "./stream.types.js";
export { JobStreamGapError, JobStreamOverflowError } from "./stream-errors.js";

// This service owner is resource-free; each returned iterator owns its request.
const owner = ManagedRuntime.make(JobContentLive);
const service = runExecutionSync(owner, JobContent);

/**
 * Opens one bounded named-content iterator with existing continuity guarantees.
 * @typeParam Item - Declared JSON content type.
 * @param client - Borrowed generated client.
 * @param job - Declared job identity.
 * @param options - Complete request authority and existing memory bounds.
 * @returns An owned AsyncIterable; return/throw aborts pending native reads.
 */
export function watchJobStream<Item extends JsonValue = JsonValue>(
  client: unknown,
  job: string,
  options: JobStreamOptions,
): Promise<AsyncIterable<NamedStreamFrame<Item>>> {
  return runExecutionPromise(
    owner,
    service.open(client, job, options),
    options.signal === undefined ? undefined : { signal: options.signal },
  ) as Promise<AsyncIterable<NamedStreamFrame<Item>>>;
}
