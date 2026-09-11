import { describe, expect, test } from "bun:test";
import { z } from "@relkit/schema";
import { defineChannel, runWithRealtimeDispatcher } from "./src/index.ts";

describe("defineChannel", () => {
  test("distinguishes internal, public, and protected declarations", () => {
    const internal = defineChannel({
      id: "orders.internal",
      params: z.object({ orderId: z.string() }),
      events: { changed: z.object({ status: z.string() }) },
    });
    expect(internal.client).toBeUndefined();
    expect(
      defineChannel({
        id: "announcements",
        params: z.object({}),
        events: { posted: z.string() },
        client: { public: true },
      }).client,
    ).toEqual({ public: true });
  });

  test("allows presence-only channels and protects member presence", () => {
    expect(
      defineChannel({
        id: "orders.viewers",
        params: z.object({ orderId: z.string() }),
        events: {},
        client: { authorize: async () => true },
        presence: {
          member: z.object({ displayName: z.string() }),
          resolve: async () => ({ displayName: "Ada" }),
          maxMembers: 100,
        },
      }).presence,
    ).toMatchObject({ maxMembers: 100 });
    expect(() =>
      defineChannel({
        id: "public.members",
        params: z.object({}),
        events: {},
        client: { public: true },
        presence: { member: z.string(), resolve: async () => "Ada", maxMembers: 10 },
      }),
    ).toThrow("protected channel");
  });

  test("rejects ambiguous exposure and empty declarations", () => {
    expect(() => defineChannel({ id: "empty", params: z.object({}), events: {} })).toThrow(
      "must declare presence",
    );
    expect(() =>
      defineChannel({
        id: "bad",
        params: z.object({}),
        events: { changed: z.string() },
        client: { public: true, authorize: async () => true } as never,
      }),
    ).toThrow("exclusively");
  });
});

test("backend methods validate values and dispatch through the bound generation scope", async () => {
  const channel = defineChannel({
    id: "orders.backend",
    params: z.object({ orderId: z.string() }),
    events: { changed: z.object({ status: z.string() }) },
    client: { public: true },
    presence: "count",
  });
  const calls: string[] = [];
  const dispatcher = {
    trigger: async ({ event }: { readonly event: string }) => {
      calls.push(event);
      return {
        accepted: true as const,
        eventId: "event-1",
        checkpoint: {
          applicationId: "app",
          environment: "test",
          channelId: channel.id,
          partition: "order-1",
          profile: "default",
          identityScope: "public",
          sessionEpoch: "public",
          policyEpoch: "policy",
          providerEpoch: "epoch",
          sequence: "1",
          historyStart: "1",
          expiresAt: new Date().toISOString(),
        },
        profile: "default",
        providerEpoch: "epoch",
        duplicate: false,
      };
    },
    getPresence: async () => ({
      connections: 1,
      status: "fresh" as const,
      revision: "1",
      scope: "shared" as const,
    }),
  };
  await runWithRealtimeDispatcher(dispatcher, () =>
    channel.trigger({ orderId: "order-1" }, "changed", { status: "paid" }),
  );
  expect(calls).toEqual(["changed"]);
  expect(
    await runWithRealtimeDispatcher(dispatcher, () => channel.getPresence({ orderId: "order-1" })),
  ).toMatchObject({ connections: 1 });
});
