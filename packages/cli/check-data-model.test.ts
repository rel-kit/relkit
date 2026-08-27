import { expect, test } from "bun:test";
import { isolateDataModels, prefilterSources } from "@relkit/compiler";

test("keeps data-model modules out of compiler evaluation", () => {
  const source = `
    import { defineDataModel } from "@relkit/drizzle";
    const database = (() => { throw new Error("must not execute"); })();
    export default defineDataModel(database, { users });
  `;
  const candidate = prefilterSources([
    { fileName: "src/data/application.data-model.ts", text: source },
  ]).candidates[0]!;
  const isolated = isolateDataModels([candidate], "generation-test");
  expect(isolated.evaluated).toEqual([]);
  expect(isolated.modules[0]).toMatchObject({
    file: "src/data/application.data-model.ts",
    exports: [{ exportName: "default", descriptor: { kind: "data-model" } }],
  });
});
