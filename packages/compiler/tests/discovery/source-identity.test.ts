import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { StableIdError } from "@relkit/contracts";
import {
  encodeErrorIdEffect,
  encodeExportIdEffect,
  encodeMemberIdEffect,
  encodeRouteIdEffect,
  encodeSourceHierarchyEffect,
  encodeSourceIdEffect,
  encodeMemberId,
} from "../../src/discovery/source-id.js";

describe("composable discovery identities", () => {
  it.effect("strips conventional path structure while preserving named/default identities", () =>
    Effect.gen(function* () {
      expect(
        yield* encodeSourceHierarchyEffect(
          "src\\orders\\functions\\getOrder.function.ts",
          "function",
        ),
      ).toBe("orders.get-order");
      expect(yield* encodeSourceHierarchyEffect("src/orders/service.ts", "service")).toBe("orders");
      expect(yield* encodeSourceHierarchyEffect("src/orders/functions/index.ts", "function")).toBe(
        "orders",
      );
      for (const exportKind of ["named", "default"] as const) {
        expect(
          yield* encodeExportIdEffect({
            source: "src/orders/functions/get-order.function.ts",
            kind: "function",
            exportName: "entry",
            exportKind,
            binding: "getOrder",
          }),
        ).toBe("orders.get-order");
      }
      expect(yield* encodeErrorIdEffect("src/orders/errors/order.error.ts", "InvalidError")).toBe(
        "orders.order.InvalidError",
      );
      expect(yield* encodeMemberIdEffect("orders", "getOrder")).toBe("orders.get-order");
    }),
  );

  it.effect("preserves method, dynamic, root and optional catch-all route spelling", () =>
    Effect.gen(function* () {
      expect(yield* encodeRouteIdEffect("get", "/orders/:orderId")).toBe(
        "route.get.orders.by-order-id",
      );
      expect(yield* encodeRouteIdEffect("POST", "/")).toBe("route.post.root");
      expect(yield* encodeRouteIdEffect("GET", "/files/*parts")).toBe(
        "route.get.files.catch-all-parts",
      );
      expect(yield* encodeRouteIdEffect("GET", "/files/*parts?")).toBe(
        "route.get.files.optional-catch-all-parts",
      );
      expect(yield* encodeRouteIdEffect("UNKNOWN", "/orders")).toBeUndefined();
      expect(yield* encodeRouteIdEffect("GET", "orders")).toBeUndefined();
    }),
  );

  it.effect("uses explicit authority before interpreting incomplete source provenance", () =>
    Effect.gen(function* () {
      expect(
        yield* encodeSourceIdEffect({
          kind: "route",
          source: "",
          explicitId: " orders.authoritative ",
        }),
      ).toBe("orders.authoritative");
      expect(yield* encodeSourceIdEffect({ kind: "route", source: "" })).toBeUndefined();
      expect(
        yield* encodeSourceIdEffect({
          kind: "service",
          source: "",
          serviceId: "orders",
          member: "listAll",
        }),
      ).toBe("orders.list-all");
      expect(
        yield* encodeSourceIdEffect({
          kind: "error",
          source: "src/errors/order.error.ts",
          binding: "MissingError",
        }),
      ).toBe("errors.order.MissingError");
    }),
  );

  it.effect("keeps explicit and derived validation failures typed and sync failures intact", () =>
    Effect.gen(function* () {
      const explicit = yield* Effect.flip(
        encodeSourceIdEffect({ kind: "function", source: "src/a.ts", explicitId: "invalid/id" }),
      );
      expect(explicit).toBeInstanceOf(StableIdError);
      expect(explicit._tag).toBe("StableIdError");
      const derived = yield* Effect.flip(
        encodeErrorIdEffect("src/errors/a.error.ts", "invalid/error"),
      );
      expect(derived._tag).toBe("StableIdError");
      expect(() => encodeMemberId("invalid/service", "entry")).toThrow(StableIdError);
    }),
  );

  it.effect("defers provenance access and preserves programmer defects", () =>
    Effect.gen(function* () {
      let accesses = 0;
      const operation = encodeSourceIdEffect({
        kind: "route",
        source: "src/route.ts",
        get explicitId() {
          accesses += 1;
          return "routes.fixed";
        },
      });
      expect(accesses).toBe(0);
      expect(yield* operation).toBe("routes.fixed");
      expect(accesses).toBeGreaterThan(0);
      const defect = new TypeError("provenance bug");
      const exit = yield* Effect.exit(
        encodeSourceIdEffect({
          kind: "route",
          source: "",
          get explicitId() {
            throw defect;
          },
        }),
      );
      expect(exit).toMatchObject({
        _tag: "Failure",
        cause: { reasons: [{ _tag: "Die", defect }] },
      });
    }),
  );
});
