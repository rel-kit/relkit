import { describe, expect, test } from "bun:test";
import type { InspectorObject } from "./api-types";
import { declaredRoutesPage, methodLabel, systemRoutes } from "./system-routes";

const declared = (id: string): InspectorObject => ({
  kind: "trigger",
  id,
  config: { method: "GET", path: `/${id}` },
});
const system = (id: string, method: string, path: string): InspectorObject => ({
  kind: "trigger",
  id,
  system: true,
  description: `${id} description`,
  config: { method, path },
});

describe("the routes the framework handles itself", () => {
  test("picks the system routes out of the collection, in the order given", () => {
    const items = [
      declared("a"),
      system("relkit.auth", "*", "/api/auth/*"),
      declared("b"),
      system("relkit.system.health", "GET", "/healthz"),
      system("relkit.rpc", "*", "/_relkit/v1/rpc/*"),
    ];
    expect(systemRoutes(items)).toEqual([
      {
        id: "relkit.auth",
        method: "ANY",
        path: "/api/auth/*",
        description: "relkit.auth description",
        prefix: true,
      },
      {
        id: "relkit.system.health",
        method: "GET",
        path: "/healthz",
        description: "relkit.system.health description",
        prefix: false,
      },
      {
        id: "relkit.rpc",
        method: "ANY",
        path: "/_relkit/v1/rpc/*",
        description: "relkit.rpc description",
        prefix: true,
      },
    ]);
  });

  test("an application without a mounted authentication handler lists two", () => {
    expect(
      systemRoutes([
        system("relkit.system.health", "GET", "/healthz"),
        system("relkit.rpc", "*", "/rpc/*"),
      ]).map((route) => route.id),
    ).toEqual(["relkit.system.health", "relkit.rpc"]);
  });

  test("a wildcard method reads as any method", () => {
    expect(methodLabel("*")).toBe("ANY");
    expect(methodLabel("POST")).toBe("POST");
    expect(methodLabel(undefined)).toBe("HTTP");
  });
});

describe("the declared routes among the whole collection", () => {
  test("drops system routes from the page and from the total", () => {
    const page = {
      items: [declared("a"), declared("b")],
      total: 5,
    };
    expect(declaredRoutesPage(page, 0, 3)).toEqual({ items: page.items, total: 2 });
  });

  test("a page that holds system routes keeps only the declared ones", () => {
    const page = {
      items: [
        declared("c"),
        system("relkit.auth", "*", "/api/auth/*"),
        system("relkit.rpc", "*", "/r/*"),
      ],
      total: 23,
    };
    expect(declaredRoutesPage(page, 20, 3)).toEqual({ items: page.items.slice(0, 1), total: 20 });
  });

  test("a continuation that would lead only to system routes is dropped", () => {
    const page = {
      items: Array.from({ length: 20 }, (_, i) => declared(`r${i}`)),
      nextCursor: "20",
      total: 23,
    };
    const result = declaredRoutesPage(page, 0, 3);
    expect(result.nextCursor).toBeUndefined();
    expect(result.total).toBe(20);
  });

  test("a continuation that leads to more declared routes is kept", () => {
    const page = {
      items: Array.from({ length: 20 }, (_, i) => declared(`r${i}`)),
      nextCursor: "20",
      total: 43,
    };
    expect(declaredRoutesPage(page, 0, 3).nextCursor).toBe("20");
  });

  test("without a total the page is only filtered", () => {
    const page = { items: [declared("a"), system("relkit.rpc", "*", "/r/*")] };
    expect(declaredRoutesPage(page, 0, 1)).toEqual({ items: page.items.slice(0, 1) });
  });
});
