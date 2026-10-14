/** Records fake mail once per key in process-local memory for the export tutorial; no network message is sent. */
import type { FakeMailInput, FakeMailReceipt, FakeMailRecord } from "./fake-mail.types.js";

const sent = new Map<string, FakeMailRecord>();

/** Records the first fake delivery for a key and reports duplicate admissions.
 * @param input - Tutorial destination, subject and process-local deduplication key.
 * @returns Acceptance and the original key, without performing an external side effect. */
export function sendFakeMail(input: FakeMailInput): FakeMailReceipt {
  const accepted = !sent.has(input.idempotencyKey);
  if (accepted) sent.set(input.idempotencyKey, { to: input.to, subject: input.subject });
  return { accepted, idempotencyKey: input.idempotencyKey };
}

/** Reads the recorded first deliveries in insertion order.
 * @returns A new list containing this module instance's destination/subject records. */
export function fakeMailLog(): readonly FakeMailRecord[] {
  return [...sent.values()];
}
