import { expect, test } from "bun:test";
import { defineFunction } from "../../packages/functions/src/index.js";
import { defineRoute } from "../../packages/routes/src/index.js";
import { z } from "../../packages/schema/src/index.js";
import { normalizeCompilation } from "../../packages/compiler/src/normalize.js";

test("inferred routes reject path parameters absent from the target input schema", () => {
  const target = defineFunction({
    id: "users.example",
    input: z.object({ value: z.string() }),
    output: z.object({ value: z.string() }),
    handler: async ({ value }) => ({ value }),
  });
  const route = defineRoute({ id: "users.get", target });
  const result = normalizeCompilation({
    descriptors: [
      target,
      {
        descriptor: route,
        exportName: "GET",
        exportKind: "named",
        source: { file: "src/routes/users/[id]/route.ts", line: 1, column: 14 },
        reference: {
          generationId: "path-input-test",
          descriptorId: route.id,
          kind: "route",
          module: "src/routes/users/[id]/route.ts",
          exportName: "GET",
        },
      },
    ],
  });
  expect(result.activatable).toBe(false);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "RELKIT_MAPPING_INCOMPATIBLE",
      message: expect.stringContaining('"id"'),
    }),
  );
});
