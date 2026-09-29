import { expect, test } from "vitest";
import { Effect } from "effect";
import type { ChannelNode } from "@relkit/graph";
import { graph } from "./fixtures/generator-graphs.js";
import { clientRoutes } from "../src/generate-types.js";
import { channelRegistryTypeEffect, registryTypeEffect } from "../src/generate-registry-types.js";
test("renders channel presence variants and client-disabled route metadata", () => {
  const channel = {
    kind: "channel",
    id: "updates",
    params: {},
    events: { changed: { type: "string" } },
    presence: "count",
  } as unknown as ChannelNode;
  expect(Effect.runSync(channelRegistryTypeEffect(channel))).toContain("CountPresence");
  expect(
    Effect.runSync(
      channelRegistryTypeEffect({
        ...channel,
        presence: { member: { type: "number" } },
      } as ChannelNode),
    ),
  ).toContain("MemberPresence<number>");
  expect(
    Effect.runSync(channelRegistryTypeEffect({ ...channel, presence: undefined } as ChannelNode)),
  ).toContain("never>");
  const route = clientRoutes(graph(false))[0]!;
  const disabled = {
    ...route,
    trigger: { ...route.trigger, config: { ...route.trigger.config, client: false as const } },
  };
  expect(Effect.runSync(registryTypeEffect(disabled))).toContain('operation: "query"');
  const streaming = {
    ...route,
    target: { ...route.target, output: { kind: "stream", item: { type: "string" } } },
  };
  expect(Effect.runSync(registryTypeEffect(streaming))).toContain("ClientStreamContract");
  expect(Effect.runSync(registryTypeEffect({ ...route, responses: [] }))).toContain(", Error> &");
});
