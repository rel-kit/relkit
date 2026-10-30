import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { InspectorGraph } from "./api-types";
import { normalizeGraphResponse } from "./graph-model";
import { buildHierarchy, domainOf, isProtected, routeAccess, tableNodeId } from "./graph-hierarchy";
import { architectureView, domainView, flowView, labelEdge } from "./graph-views";
import { highlightFor } from "./graph-highlight";
import { graphSearch, parseGraphLocation, toggleFilter } from "./graph-url-state";
import { layoutCompound } from "./graph-view-layout";
import {
  functionErrors,
  nodeSource,
  nodeTitle,
  routeMethod,
  routePath,
  routeRequestFields,
  routeResponses,
} from "./graph-node-meta";
import { edgeVerb, nodeCategory } from "./graph-semantics";

const payload = JSON.parse(
  readFileSync(resolve(import.meta.dir, "fixtures/logistics.graph.json"), "utf8"),
) as InspectorGraph;
const snapshot = normalizeGraphResponse(payload);
const hierarchy = buildHierarchy(snapshot);

describe("graph node metadata", () => {
  test("keeps projected metadata on nodes", () => {
    const route = snapshot.nodes.find((node) => node.id === "route.post.trips")!;
    expect(routeMethod(route)).toBe("POST");
    expect(routePath(route)).toBe("/trips");
    expect(nodeTitle(route)).toBe("POST /trips");
    expect(nodeSource(route)?.file).toBe("src/routes/trips/route.ts");
    const fields = routeRequestFields(route);
    expect(fields.find((field) => field.name === "pickupAddress")).toEqual({
      name: "pickupAddress",
      location: "body",
      optional: false,
    });
    expect(fields.find((field) => field.name === "companyId")?.optional).toBe(true);
    expect(routeResponses(route).map((response) => response.status)).toEqual([
      201, 401, 403, 404, 409, 422,
    ]);
    const fn = snapshot.nodes.find((node) => node.id === "trips.create-trip")!;
    expect(nodeTitle(fn)).toBe("create-trip");
    expect(functionErrors(fn).map((error) => `${error.id}:${error.status}`)).toContain(
      "auth.forbidden:403",
    );
    expect(nodeCategory(route)).toBe("route");
    expect(
      nodeCategory(
        snapshot.nodes.find(
          (node) => node.id === "relkit.event.notifications.on-trip-created.trigger",
        )!,
      ),
    ).toBe("listener");
  });

  test("reads table edges", () => {
    const edge = snapshot.declaredEdges.find(
      (item) =>
        item.kind === "uses-table" && item.from === "trips.create-trip" && item.table === "trips",
    )!;
    expect(edge.access).toBe("write");
    expect(edgeVerb(edge)).toBe("writes trips");
  });
});

describe("graph hierarchy", () => {
  test("groups nodes into domains and platform", () => {
    expect(hierarchy.domains.map((domain) => domain.id)).toEqual([
      "companies",
      "notifications",
      "support",
      "trips",
      "users",
    ]);
    const trips = hierarchy.domains.find((domain) => domain.id === "trips")!;
    expect(trips.routes.map((node) => node.id)).toEqual(["route.get.trips", "route.post.trips"]);
    expect(trips.functions.map((node) => node.id)).toEqual([
      "trips.create-trip",
      "trips.list-trips",
    ]);
    expect(trips.events.map((node) => node.id)).toEqual(["trips.created"]);
    expect(trips.channels.map((node) => node.id)).toEqual(["trips.dispatch", "trips.updates"]);
    const notifications = hierarchy.domains.find((domain) => domain.id === "notifications")!;
    expect(notifications.listeners.map((node) => node.id)).toEqual([
      "relkit.event.notifications.on-trip-created.trigger",
    ]);
    expect(hierarchy.platform.database?.id).toBe("database");
    expect(hierarchy.platform.auth?.id).toBe("auth");
    expect(hierarchy.platform.tables.map((node) => node.id)).toContain(tableNodeId("trips"));
    expect(hierarchy.platform.routes.map((node) => node.id)).toEqual([
      "route.all.api.auth.optional-catch-all-auth",
    ]);
    expect(trips.routeGroup?.id).toBe("routes:trips");
    expect(hierarchy.nodes.get("routes:trips")?.kind).toBe("route-group");
    expect(hierarchy.ownerOf.get("routes:trips")).toBe("trips");
    expect(hierarchy.platform.routeGroup?.label).toBe("/api/auth");
    expect(hierarchy.platform.errors).toHaveLength(4);
    expect(hierarchy.platform.providers).toHaveLength(3);
    expect(domainOf(hierarchy, "route.post.trips")?.id).toBe("trips");
  });

  test("re-targets table access to synthesised table nodes", () => {
    expect(hierarchy.hasTableUsage).toBe(true);
    expect(hierarchy.hasCallGraph).toBe(true);
    const writes = hierarchy.outgoing
      .get("trips.create-trip")!
      .filter((edge) => edge.kind === "uses-table")
      .map((edge) => `${edge.access}:${edge.to}`)
      .sort();
    expect(writes).toEqual(["write:table:tripEvents", "write:table:trips"]);
  });
});

describe("graph views", () => {
  test("architecture view shows route groups, domains, detail cards and platform services", () => {
    const view = architectureView(hierarchy);
    expect(view.nodes.map((node) => `${node.id}:${node.category}`)).toEqual([
      "routes:support:route",
      "routes:trips:route",
      "routes:auth:route",
      "companies:service",
      "notifications:service",
      "support:service",
      "trips:service",
      "users:service",
      "notifications.inbox:channel",
      "support.assistant-agent:agent",
      "support.list-my-trips-tool:tool",
      "trips.created:event",
      "trips.dispatch:channel",
      "trips.updates:channel",
      "auth:auth",
      "database:database",
    ]);
    const tripsRoutes = view.nodes.find((node) => node.id === "routes:trips")!;
    expect(tripsRoutes.title).toBe("/trips");
    expect(tripsRoutes.subtitle).toBe("2 routes · all protected");
    // Handler-level session checks show as Auth arrows; the lock is reserved for middleware.
    expect(tripsRoutes.guards).toBeUndefined();
    expect(tripsRoutes.rank).toBe("first");
    expect(tripsRoutes.counts).toEqual([
      { label: "GET", value: 1 },
      { label: "POST", value: 1 },
    ]);
    expect(view.nodes.find((node) => node.id === "routes:auth")?.title).toBe("/api/auth");
    expect(view.nodes.filter((node) => node.side).map((node) => node.id)).toEqual([
      "auth",
      "database",
    ]);
    const label = (id: string) => view.edges.find((edge) => edge.id === id)?.label;
    expect(label("routes:trips->trips")).toBe("2 routes");
    expect(label("trips->companies")).toBe("2 calls");
    expect(label("trips->database")).toBe("3 table accesses");
    expect(label("trips->auth")).toBe("2 session checks");
    expect(view.edges.find((edge) => edge.id === "trips->auth")?.group).toBe("auth");
    expect(label("trips->trips.created")).toBe("publishes");
    expect(label("trips.created->notifications")).toBe("wakes");
    expect(label("trips->trips.dispatch")).toBe("pushes");
    expect(label("support->support.assistant-agent")).toBe("asks");
    expect(label("support.assistant-agent->support.list-my-trips-tool")).toBe("uses");
    expect(label("support.list-my-trips-tool->support")).toBe("runs");
    expect(label("auth->database")).toBe("depends on");
    expect(view.available).toEqual({
      routes: 3,
      services: 5,
      channels: 3,
      agents: 1,
      tools: 1,
      events: 1,
      auth: 1,
      data: 1,
    });
  });

  test("architecture filters fold detail cards into domain arrows and remove the rest", () => {
    const folded = architectureView(hierarchy, {
      hidden: new Set(["events", "channels", "agents", "tools"]),
    });
    expect(folded.nodes.some((node) => node.category === "event")).toBe(false);
    expect(folded.edges.find((edge) => edge.id === "trips->notifications")?.label).toBe("1 event");
    expect(folded.available.events).toBe(1);
    const noData = architectureView(hierarchy, { hidden: new Set(["data", "auth"]) });
    expect(noData.nodes.some((node) => node.id === "database" || node.id === "auth")).toBe(false);
    expect(noData.edges.some((edge) => edge.to === "database" || edge.to === "auth")).toBe(false);
  });

  test("domain view speaks the map's language outside the domain", () => {
    const view = domainView(hierarchy, "trips")!;
    const group = view.nodes.find((node) => node.id === "group:trips")!;
    expect(group.type).toBe("service");
    const members = view.nodes.filter((node) => node.parentId === "group:trips");
    expect(members.map((node) => node.id).sort()).toEqual([
      "route.get.trips",
      "route.post.trips",
      "trips.create-trip",
      "trips.created",
      "trips.dispatch",
      "trips.list-trips",
      "trips.updates",
    ]);
    const outside = view.nodes.filter(
      (node) => node.parentId === undefined && node.id !== "group:trips",
    );
    expect(outside.map((node) => `${node.id}:${node.category}${node.side ? ":side" : ""}`)).toEqual(
      [
        "auth:auth:side",
        "table:tripEvents:table:side",
        "table:trips:table:side",
        "companies:service",
        "notifications:service",
      ],
    );
    const label = (id: string) => view.edges.find((edge) => edge.id === id)?.label;
    expect(label("trips.create-trip->companies:invoke")).toBe("2 calls");
    expect(label("trips.created->notifications:event")).toBe("wakes");
    expect(label("group:trips->auth:session")).toBe("2 session checks");
    const toTable = view.edges.find(
      (edge) => edge.id === "trips.create-trip->table:trips:uses-table:trips",
    )!;
    expect(toTable.label).toBe("writes trips");
    expect(labelEdge(view, toTable)).toBe(false);
    expect(
      labelEdge(
        view,
        view.edges.find((edge) => edge.label === "2 calls")!,
      ),
    ).toBe(true);
    expect(view.edges.find((edge) => edge.from === "route.post.trips")?.label).toBe("handled by");
  });

  test("flow view follows a request end to end", () => {
    const view = flowView(hierarchy, "route.post.trips")!;
    expect(view.title).toBe("POST /trips request flow");
    const byStage = (stage: string) =>
      view.nodes
        .filter((node) => node.stage === stage)
        .map((node) => node.id)
        .sort();
    expect(byStage("request")).toEqual(["route.post.trips"]);
    expect(byStage("handler")).toEqual(["trips.create-trip"]);
    expect(byStage("calls")).toEqual(["companies.describe", "companies.membership"]);
    expect(byStage("data")).toEqual([
      "table:companies",
      "table:employees",
      "table:tripEvents",
      "table:trips",
    ]);
    expect(byStage("events")).toEqual(["trips.created"]);
    expect(byStage("listeners")).toEqual([
      "notifications.notify",
      "notifications.on-trip-created",
      "users.staff-ids",
    ]);
    expect(byStage("realtime")).toEqual(["notifications.inbox", "trips.dispatch", "trips.updates"]);
    expect(byStage("response")).toEqual([
      "auth.forbidden",
      "auth.unauthenticated",
      "resource.conflict",
      "resource.not-found",
      "response:success.201",
      "response:validation.422",
    ]);
    const listener = view.nodes.find((node) => node.id === "notifications.on-trip-created")!;
    expect(listener.badges).toEqual(["on created"]);
    const notify = view.nodes.find((node) => node.id === "notifications.notify")!;
    expect(notify.subtitle).toBe("writes notifications");
    expect(
      view.edges.find(
        (edge) => edge.id === "trips.created->notifications.on-trip-created:listens-to-event",
      )?.label,
    ).toBe("wakes");
    expect(view.edges.find((edge) => edge.to === "response:success.201")?.label).toBe("returns");
    expect(byStage("access")).toEqual(["auth"]);
    expect(view.nodes.find((node) => node.id === "auth")?.subtitle).toBe(
      "session required · role checked",
    );
    expect(view.edges.find((edge) => edge.to === "trips.create-trip")?.label).toBe("allows");
    expect(view.stages!.find((stage) => stage.id === "access")?.note).toContain("context.auth");
    expect(view.stages!.map((stage) => stage.id)).toEqual([
      "request",
      "access",
      "handler",
      "calls",
      "data",
      "events",
      "listeners",
      "realtime",
      "response",
    ]);
  });

  test("flow view from a function lists its routes and output", () => {
    const view = flowView(hierarchy, "companies.describe")!;
    expect(view.nodes.filter((node) => node.stage === "request")).toHaveLength(0);
    expect(view.nodes.find((node) => node.id === "response:output")?.title).toBe("Output");
    expect(view.nodes.filter((node) => node.stage === "data").map((node) => node.id)).toEqual([
      "table:companies",
    ]);
  });

  test("flow view degrades without table usage", () => {
    const stripped = normalizeGraphResponse({
      ...payload,
      graph: {
        ...(payload.graph as Record<string, unknown>),
        edges: (payload.graph as { edges: readonly { kind: string }[] }).edges.filter(
          (edge) => edge.kind !== "uses-table",
        ),
      },
    } as InspectorGraph);
    const view = flowView(buildHierarchy(stripped), "route.post.trips")!;
    expect(view.nodes.filter((node) => node.stage === "data").map((node) => node.id)).toEqual([
      "database",
    ]);
    expect(view.stages!.find((stage) => stage.id === "data")?.note).toContain("does not record");
  });

  test("returns undefined for nodes that cannot start a flow", () => {
    expect(flowView(hierarchy, "trips.created")).toBeUndefined();
    expect(domainView(hierarchy, "database")).toBeUndefined();
  });
});

describe("route access", () => {
  test("derives session and role checks from declared errors", () => {
    const route = hierarchy.nodes.get("route.post.trips")!;
    expect(routeAccess(hierarchy, route)).toEqual({ session: true, role: true, middleware: [] });
    const health = hierarchy.platform.routes.find((node) => node.id.includes("auth"))!;
    expect(isProtected(routeAccess(hierarchy, health))).toBe(false);
  });

  test("shows middleware as locks on routes and their edges, in order", () => {
    const post = hierarchy.nodes.get("route.post.trips")!;
    const list = hierarchy.nodes.get("route.get.trips")!;
    const guarded = buildHierarchy({
      ...snapshot,
      nodes: [
        ...snapshot.nodes,
        { id: "require-session", kind: "middleware" },
        { id: "rate-limit", kind: "middleware" },
      ],
      declaredEdges: [
        ...snapshot.declaredEdges,
        {
          relationship: "declared",
          kind: "uses-middleware",
          from: post.id,
          to: "rate-limit",
          order: 1,
        },
        {
          relationship: "declared",
          kind: "uses-middleware",
          from: post.id,
          to: "require-session",
          order: 0,
        },
        {
          relationship: "declared",
          kind: "uses-middleware",
          from: list.id,
          to: "require-session",
          order: 0,
        },
      ],
    });
    expect(routeAccess(guarded, post).middleware).toEqual(["require-session", "rate-limit"]);

    const map = architectureView(guarded);
    expect(map.nodes.some((node) => node.category === "middleware")).toBe(false);
    const group = map.nodes.find((node) => node.id === "routes:trips")!;
    expect(group.guards).toEqual(["require-session", "rate-limit"]);
    expect(group.guardNote).toBe("All 2 routes pass through require-session → rate-limit");
    const toDomain = map.edges.find((edge) => edge.id === "routes:trips->trips")!;
    expect(toDomain.guards).toEqual(["require-session", "rate-limit"]);
    expect(toDomain.label).toBe("2 routes");
    expect(map.available.middleware).toBe(1);

    const domain = domainView(guarded, "trips")!;
    expect(domain.nodes.find((node) => node.id === post.id)?.guards).toEqual([
      "require-session",
      "rate-limit",
    ]);
    const handled = domain.edges.find((edge) => edge.from === post.id)!;
    expect(handled.guards).toEqual(["require-session", "rate-limit"]);
    expect(labelEdge(domain, handled)).toBe(true);
    expect(domain.nodes.some((node) => node.id === "rate-limit")).toBe(false);

    const flow = flowView(guarded, post.id)!;
    expect(flow.nodes.filter((node) => node.stage === "access").map((node) => node.id)).toEqual([
      "auth",
    ]);
    expect(flow.edges.find((edge) => edge.from === post.id)?.guards).toEqual([
      "require-session",
      "rate-limit",
    ]);

    const onlyGuarded = architectureView(guarded, { only: new Set(["middleware"]) });
    expect(onlyGuarded.nodes.map((node) => node.id)).toEqual(["routes:trips"]);
    expect(onlyGuarded.nodes[0]?.guards).toEqual(["require-session", "rate-limit"]);
  });
});

describe("canvas highlight", () => {
  test("a selected route group lights the path down to the database", () => {
    const view = architectureView(hierarchy, {
      hidden: new Set(["events", "channels", "agents", "tools"]),
    });
    const lit = highlightFor(view, "routes:trips", true);
    for (const id of ["routes:trips", "trips", "companies", "users", "database", "auth"])
      expect(lit.nodes.has(id)).toBe(true);
    expect(lit.nodes.has("routes:support")).toBe(false);
    expect(lit.edges.has("routes:trips->trips")).toBe(true);
    expect(lit.edges.has("trips->database")).toBe(true);
    expect(lit.edges.has("companies->database")).toBe(true);
    expect(lit.edges.has("routes:support->support")).toBe(false);
  });

  test("hover lights only direct neighbours", () => {
    const view = architectureView(hierarchy, {
      hidden: new Set(["events", "channels", "agents", "tools"]),
    });
    const lit = highlightFor(view, "routes:trips", false);
    expect([...lit.nodes].sort()).toEqual(["routes:trips", "trips"]);
  });
});

describe("side column layout", () => {
  test("auth and the database sit beside the hierarchy in both directions", async () => {
    const view = architectureView(hierarchy, {
      hidden: new Set(["events", "channels", "agents", "tools"]),
    });
    const down = await layoutCompound(view, "down");
    const at = (layout: typeof down, id: string) => layout.nodes.find((node) => node.id === id)!;
    const mainRight = Math.max(
      ...down.nodes
        .filter((node) => !["auth", "database"].includes(node.id) && node.parentId === undefined)
        .map((node) => node.x + node.width),
    );
    expect(at(down, "auth").x).toBeGreaterThan(mainRight);
    expect(at(down, "database").x).toBe(at(down, "auth").x);
    expect(at(down, "database").y).toBeGreaterThan(at(down, "auth").y);
    expect(down.routes.has("trips->database")).toBe(false);

    const right = await layoutCompound(view, "right");
    const mainBottom = Math.max(
      ...right.nodes
        .filter((node) => !["auth", "database"].includes(node.id) && node.parentId === undefined)
        .map((node) => node.y + node.height),
    );
    expect(at(right, "auth").y).toBeGreaterThan(mainBottom);
    expect(at(right, "database").x).toBeGreaterThan(at(right, "auth").x);
  });
});

describe("edge coordinates", () => {
  test("edges inside a domain box start and end on their cards", async () => {
    const view = domainView(hierarchy, "trips")!;
    for (const direction of ["down", "right"] as const) {
      const layout = await layoutCompound(view, direction);
      const group = layout.nodes.find((node) => node.id === "group:trips")!;
      const box = (id: string) => {
        const node = layout.nodes.find((item) => item.id === id)!;
        const dx = node.parentId === undefined ? 0 : group.x;
        const dy = node.parentId === undefined ? 0 : group.y;
        return { x: node.x + dx, y: node.y + dy, width: node.width, height: node.height };
      };
      const edge = view.edges.find((item) => item.from === "route.post.trips")!;
      const points = layout.routes.get(edge.id)!;
      const from = box(edge.from);
      const to = box(edge.to);
      const start = points[0]!;
      const end = points.at(-1)!;
      const on = (point: { x: number; y: number }, card: typeof from) =>
        point.x >= card.x - 1 &&
        point.x <= card.x + card.width + 1 &&
        point.y >= card.y - 1 &&
        point.y <= card.y + card.height + 1;
      expect(on(start, from)).toBe(true);
      expect(on(end, to)).toBe(true);
    }
  });
});

describe("filter selection", () => {
  test("nothing selected shows everything; a selection shows only those kinds", () => {
    const all = architectureView(hierarchy);
    expect(architectureView(hierarchy, { only: new Set() }).nodes.length).toBe(all.nodes.length);
    const services = architectureView(hierarchy, { only: new Set(["services"]) });
    expect(services.nodes.every((node) => node.category === "service")).toBe(true);
    expect(services.edges.find((edge) => edge.id === "trips->notifications")?.label).toBe(
      "1 event",
    );
    const routesAndServices = architectureView(hierarchy, {
      only: new Set(["routes", "services"]),
    });
    expect(new Set(routesAndServices.nodes.map((node) => node.category))).toEqual(
      new Set(["route", "service"]),
    );
    expect(routesAndServices.edges.some((edge) => edge.id === "routes:trips->trips")).toBe(true);
    expect(routesAndServices.available).toEqual(all.available);
  });

  test("toggling builds up and clears the selection in the URL", () => {
    const first = toggleFilter({}, "routes");
    expect(graphSearch(first)).toBe("?only=routes");
    const second = toggleFilter(first, "services");
    expect(graphSearch(second)).toBe("?only=routes%2Cservices");
    expect(graphSearch(toggleFilter(toggleFilter(second, "routes"), "services"))).toBe("");
    expect(parseGraphLocation(new URLSearchParams("only=services,routes,bogus")).only).toEqual([
      "routes",
      "services",
    ]);
  });
});
