import { describe, expect, test } from "bun:test";
import {
  compareRouteFilePaths,
  parseRouteFilePath,
} from "../../packages/compiler/src/route-file.ts";

describe("route-file paths", () => {
  test("parses root, static, and dynamic routes", () => {
    expect(parseRouteFilePath("src/routes/route.ts")).toMatchObject({
      canonicalPath: "/",
      runtimePaths: ["/"],
      parameters: [],
      precedence: 0,
    });
    expect(parseRouteFilePath("./src/routes/orders/[orderId]/route.ts")).toMatchObject({
      sourcePath: "src/routes/orders/[orderId]/route.ts",
      canonicalPath: "/orders/:orderId",
      runtimePaths: ["/orders/:orderId"],
      parameters: [{ name: "orderId", kind: "dynamic" }],
      precedence: 1,
    });
  });

  test("parses required and optional catch-all variants", () => {
    expect(parseRouteFilePath("src/routes/files/[...parts]/route.ts")).toMatchObject({
      canonicalPath: "/files/*parts",
      runtimePaths: ["/files/:parts{.+}"],
      parameters: [{ name: "parts", kind: "catch-all" }],
      precedence: 2,
    });
    expect(parseRouteFilePath("src\\routes\\docs\\[[...parts]]\\route.ts")).toMatchObject({
      canonicalPath: "/docs/*parts?",
      runtimePaths: ["/docs", "/docs/:parts{.+}"],
      parameters: [{ name: "parts", kind: "optional-catch-all" }],
      precedence: 3,
    });
  });

  test("sorts route kinds by documented precedence", () => {
    const paths = [
      "src/routes/[...parts]/route.ts",
      "src/routes/[id]/route.ts",
      "src/routes/[[...parts]]/route.ts",
      "src/routes/orders/route.ts",
    ].map(parseRouteFilePath);

    expect(paths.sort(compareRouteFilePaths).map((path) => path.precedence)).toEqual([0, 1, 2, 3]);
  });

  test("rejects unsupported and ambiguous route files", () => {
    const invalid = [
      "src/routes/orders.route.ts",
      "src/route.ts",
      "src/routes/[]/route.ts",
      "src/routes/[bad-name]/route.ts",
      "src/routes/[...parts]/more/route.ts",
      "src/routes/[id]/[id]/route.ts",
      "src/routes/[broken/route.ts",
      "src/routes/(group)/route.ts",
      "src/routes/@parallel/route.ts",
    ];

    for (const path of invalid) expect(() => parseRouteFilePath(path)).toThrow();
  });
});
