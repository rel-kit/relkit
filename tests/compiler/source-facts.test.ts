import { describe, expect, test } from "bun:test";
import * as ts from "typescript";
import { readFacts } from "../../packages/compiler/src/discovery/source-facts.ts";
import { mapSourceLocations } from "../../packages/compiler/src/discovery/source-map.ts";

const source = `
  import { defineError, defineFunction } from "@relkit/functions";
  import { defineRoute } from "@relkit/routes";
  import { defineService } from "@relkit/services";
  const getOrder = defineFunction({ input: schema, output: schema, handler: async () => ({}) });
  const named = defineFunction({ id: "orders.named", input: schema, output: schema, handler: async () => ({}) });
  const orders = defineService({ functions: { getOrder, lookup: named } });
  export const GET = defineRoute({ target: orders.getOrder });
  export { getOrder as lookup, orders as OrderService };
  export default getOrder;
  const InvalidError = defineError({ data: schema, message: "invalid", retry: "never" });
  let ignoredError = defineError({ data: schema, message: "ignored", retry: "never" });
`;

describe("TypeScript discovery facts", () => {
  test("finds bindings, exports, route operations, service members, and local errors syntactically", () => {
    const facts = readFacts(parse(source));

    expect(facts.factoryBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binding: "getOrder",
          factory: "defineFunction",
          kind: "function",
          idOptional: true,
          id: "omitted",
        }),
        expect.objectContaining({
          binding: "named",
          factory: "defineFunction",
          idOptional: true,
          id: "explicit",
        }),
        expect.objectContaining({ binding: "orders", factory: "defineService", idOptional: true }),
        expect.objectContaining({ binding: "GET", factory: "defineRoute", idOptional: true }),
      ]),
    );
    expect(facts.exports.get("lookup")).toMatchObject({ binding: "getOrder" });
    expect(facts.exports.get("default")).toMatchObject({ binding: "getOrder" });
    expect(facts.routeOperations).toEqual([
      expect.objectContaining({ exportName: "GET", method: "GET", binding: "GET" }),
    ]);
    expect(facts.serviceMembers).toEqual([
      expect.objectContaining({ service: "orders", member: "getOrder", targetBinding: "getOrder" }),
      expect.objectContaining({ service: "orders", member: "lookup", targetBinding: "named" }),
    ]);
    expect(facts.errorBindings).toEqual([
      expect.objectContaining({ binding: "InvalidError", id: "omitted" }),
    ]);
    expect(facts.errorBindings.map(({ binding }) => binding)).not.toContain("ignoredError");
  });

  test("carries facts through source mapping without importing the source", () => {
    const entries = mapSourceLocations(
      [
        {
          file: "src/routes/orders/route.ts",
          exports: [
            {
              exportName: "GET",
              descriptor: {
                kind: "route",
                id: "orders.get",
                ref: { kind: "route", id: "orders.get" },
                metadata: {},
              },
            },
          ],
          manifestReferences: [],
        },
      ],
      {
        projectRoot: "/tmp/relkit-facts",
        sources: [{ fileName: "src/routes/orders/route.ts", text: source }],
      },
    );

    expect(entries[0]?.facts.routeOperations).toEqual([
      expect.objectContaining({ exportName: "GET", method: "GET" }),
    ]);
    expect(entries[0]?.exportFact).toMatchObject({ binding: "GET" });
  });
});

function parse(text: string): ts.SourceFile {
  return ts.createSourceFile("src/routes/orders/route.ts", text, ts.ScriptTarget.Latest, true);
}
