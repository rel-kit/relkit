import { expect, test } from "bun:test";
import type { DomainGroup } from "./graph-hierarchy";
import type { GraphNode } from "./graph-model";
import { domainCard } from "./graph-views-cards";

const node = (id: string, kind: string): GraphNode => ({ id, kind, label: id.split(".").pop()! });

function domain(members: readonly GraphNode[]): DomainGroup {
  const service = node("fleet", "service");
  return {
    id: "fleet",
    service,
    routes: [],
    functions: [node("fleet.create", "function")],
    listeners: [],
    events: [],
    channels: [],
    tools: [],
    agents: [],
    jobs: [],
    members: [service, ...members],
  };
}

test("a domain card lists the buckets and caches it owns (IN-45)", () => {
  const card = domainCard(
    domain([node("fleet.photos", "bucket"), node("fleet.prices", "cache"), node("fleet.x", "x")]),
  );
  expect(card.counts).toContainEqual({ label: "bucket", value: 1 });
  expect(card.counts).toContainEqual({ label: "cache", value: 1 });
  expect(card.resources).toEqual(["bucket photos", "cache prices"]);
});

test("a domain without resources lists none", () => {
  const card = domainCard(domain([]));
  expect(card.resources).toBeUndefined();
  expect(card.counts?.map((count) => count.label)).toEqual(["functions"]);
});
