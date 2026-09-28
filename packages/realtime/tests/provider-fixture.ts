import { z } from "@relkit/schema";
import type { RealtimeProvider, TriggerReceipt, PresenceSnapshot } from "../src/index.js";
import { defineChannel } from "../src/index.js";
/** A simple public channel with count presence for dispatcher tests.
 * @example const channel = fixtureChannel();
 */
export function fixtureChannel() {
  return defineChannel({
    id: "news",
    params: z.object({ id: z.string() }),
    events: { posted: z.string() },
    client: { public: true },
    presence: "count",
  });
}
/** Stable receipt for provider fakes.
 * @example const receipt = fixtureReceipt();
 */
export function fixtureReceipt(): TriggerReceipt {
  return {
    accepted: true,
    eventId: "event-1",
    profile: "default",
    providerEpoch: "epoch-1",
    duplicate: false,
    checkpoint: {
      applicationId: "app",
      environment: "test",
      channelId: "news",
      partition: "partition",
      profile: "default",
      policyEpoch: "policy",
      providerEpoch: "epoch-1",
      identityScope: "runtime:g1",
      sessionEpoch: "g1",
      sequence: "1",
      historyStart: "1",
      expiresAt: "2030-01-01T00:00:00.000Z",
    },
  };
}
/** Stable count presence for provider fakes.
 * @example const presence = fixturePresence();
 */
export function fixturePresence(): PresenceSnapshot {
  return { connections: 2, status: "fresh", revision: "1", scope: "shared" };
}
/** Complete provider interface with configurable exercised methods.
 * @param overrides - Methods to replace for a behavior test.
 * @returns A provider with valid defaults and failing unused methods.
 * @example const provider = fixtureProvider({ getEpoch: async () => "epoch-2" });
 */
export function fixtureProvider(overrides: Partial<RealtimeProvider> = {}): RealtimeProvider {
  const unused = () => Promise.reject(new Error("unused provider method"));
  return {
    capabilities: { replay: "memory", presenceScope: "process", durability: "volatile" },
    getEpoch: async () => "epoch-1",
    append: async () => fixtureReceipt(),
    lookupAppendReceipt: unused,
    readAfter: unused,
    waitAfter: unused,
    readPresence: async () => fixturePresence(),
    acquirePresence: unused,
    renewPresence: unused,
    releasePresence: unused,
    ...overrides,
  };
}
