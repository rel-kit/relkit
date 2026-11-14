/**
 * Requests handled by the authentication mount, the health probe and RPC carry system route
 * identifiers; the routes collection lists those routes so each has a page (IN-20).
 */
import { describe, expect, test } from "bun:test";
import { API_BASE_PATH } from "relkit/contracts";
import { graphItems } from "../../../src/inspector-api/graph-projection.ts";
import { json, makeApp } from "./contracts-fixtures.ts";

describe("system routes in the routes collection", () => {
  test("the collection lists health and RPC beside the declared routes", async () => {
    const { app } = makeApp();
    const body = await json<{ items: { id: string; system?: boolean }[]; total: number }>(
      app,
      API_BASE_PATH + "/routes?limit=100",
    );
    const system = body.items.filter((item) => item.system === true).map((item) => item.id);
    expect(system).toEqual(expect.arrayContaining(["relkit.system.health", "relkit.rpc"]));
    expect(body.items.some((item) => item.system !== true)).toBe(true);
    expect(body.total).toBe(body.items.length);
  });

  test("a mounted authentication service adds its route with the mount path", () => {
    const graph = {
      version: 1,
      nodes: [
        {
          kind: "service",
          id: "auth",
          capability: { kind: "better-auth", basePath: "/api/auth", mount: true },
        },
      ],
      edges: [],
    };
    const routes = graphItems(graph, "routes") ?? [];
    expect(routes).toContainEqual(
      expect.objectContaining({
        id: "relkit.auth",
        system: true,
        config: expect.objectContaining({ path: "/api/auth/*" }),
      }),
    );
  });
});
