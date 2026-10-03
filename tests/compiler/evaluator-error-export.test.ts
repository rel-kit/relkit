import { expect, test } from "bun:test";
import { defineError } from "../../packages/functions/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";
import { snapshotModule } from "../../packages/compiler/src/discovery/evaluator-child-utils.ts";

test("exported error constructors survive evaluator discovery", () => {
  const Issue = defineError({
    id: "demo.example-error",
    data: z.object({ message: z.string() }),
    message: ({ message }) => message,
  });
  const result = snapshotModule(
    { Issue, ordinary: () => undefined },
    { file: "src/demo/errors/example.error.ts" },
    {
      protocol: "relkit.evaluator",
      version: 1,
      generationId: "test",
      projectRoot: process.cwd(),
      candidates: [],
      environmentAllowlist: [],
      generatedDirectory: ".relkit/generated",
      networkAllowlist: [],
      sourceMaps: true,
      timeoutMs: 1000,
    },
  );
  expect(result.exports).toHaveLength(1);
  expect(result.exports[0]?.descriptor).toMatchObject({
    kind: "error",
    id: "demo.example-error",
    metadata: { data: { jsonSchema: { type: "object" } } },
  });
  expect(result.manifestReferences[0]?.exportName).toBe("Issue");
});
