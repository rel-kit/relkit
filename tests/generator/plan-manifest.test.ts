import { expect, test } from "bun:test";
import { mergeScaffoldManifest } from "../../packages/create-relkit/src/plan-manifest.ts";
import {
  SCAFFOLD_DEPENDENCIES,
  type ScaffoldDependencyName,
} from "../../packages/create-relkit/src/scaffold-catalog.ts";

for (const name of Object.keys(SCAFFOLD_DEPENDENCIES) as ScaffoldDependencyName[]) {
  for (const section of ["dependencies", "devDependencies"] as const) {
    test(`scaffold preserves ${name}'s existing Bun link in ${section}`, () => {
      const dependencies = new Set([name]);
      const result = mergeScaffoldManifest(
        JSON.stringify({ [section]: { [name]: `link:${name}` } }),
        dependencies,
        new Map(),
      );
      expect(JSON.parse(result.content)[section][name]).toBe(`link:${name}`);
      expect(result.added).toEqual({});
      expect(mergeScaffoldManifest(result.content, dependencies, new Map())).toEqual(result);
    });
  }
}

test("scaffold still rejects conflicting versions and links to another package", () => {
  for (const name of ["@relkit/local", "langchain"] as const) {
    for (const current of ["0.0.0", "link:another-package"]) {
      expect(() =>
        mergeScaffoldManifest(
          JSON.stringify({ dependencies: { [name]: current } }),
          new Set([name]),
          new Map(),
        ),
      ).toThrow(`package.json already declares ${name}@${current}.`);
    }
  }
});
