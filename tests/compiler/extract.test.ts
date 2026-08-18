import { describe, expect, test } from "bun:test";
import {
  extractDescriptors,
  mapSourceLocations,
  type SourceMapSource,
} from "../../packages/compiler/src/index.ts";

const source = `const brand = Symbol.for("zsys.descriptor");
export const named = { [brand]: true, kind: "function", id: "orders.create", ref: { kind: "function", id: "orders.create" }, handler: () => undefined };
const fallback = { [brand]: true, kind: "event", id: "orders.created", ref: { kind: "event", id: "orders.created" } };
export { fallback as default };
`;

const sources: readonly SourceMapSource[] = [{ fileName: "src/descriptors.ts", text: source }];

describe("descriptor extraction", () => {
  test("preserves named/default exports, source positions, and data-only references", () => {
    const modules = [
      {
        file: "src/descriptors.ts",
        exports: [
          {
            exportName: "named",
            descriptor: descriptorSnapshot("function", "orders.create"),
          },
          {
            exportName: "default",
            descriptor: descriptorSnapshot("event", "orders.created"),
          },
        ],
        manifestReferences: [
          {
            generationId: "generation-test",
            descriptorId: "orders.create",
            kind: "function",
            module: "src/descriptors.ts",
            exportName: "named",
          },
          {
            generationId: "generation-test",
            descriptorId: "orders.created",
            kind: "event",
            module: "src/descriptors.ts",
            exportName: "default",
          },
        ],
      },
    ] as const;

    const locations = mapSourceLocations(modules, { projectRoot: "/tmp/zsys", sources });
    expect(locations).toMatchObject([
      {
        exportName: "default",
        exportKind: "default",
        source: { file: "src/descriptors.ts", line: 3, column: 18 },
      },
      {
        exportName: "named",
        exportKind: "named",
        source: { file: "src/descriptors.ts", line: 2, column: 22 },
      },
    ]);

    const extracted = extractDescriptors(modules, {
      projectRoot: "/tmp/zsys",
      sources,
      generationId: "generation-test",
    });
    expect(
      extracted.map(({ exportName, exportKind, source }) => ({ exportName, exportKind, source })),
    ).toEqual([
      {
        exportName: "default",
        exportKind: "default",
        source: { file: "src/descriptors.ts", line: 3, column: 18 },
      },
      {
        exportName: "named",
        exportKind: "named",
        source: { file: "src/descriptors.ts", line: 2, column: 22 },
      },
    ]);
    expect(extracted[0]?.reference).toMatchObject({
      exportName: "default",
      generationId: "generation-test",
    });
    expect(JSON.stringify(extracted)).not.toContain("function ()");
    expect(JSON.stringify(extracted)).toContain('"$zsys":"function"');
  });
});

function descriptorSnapshot(kind: string, id: string) {
  return {
    kind,
    id,
    ref: { kind, id },
    metadata: { handler: { $zsys: "function" } },
  } as const;
}
