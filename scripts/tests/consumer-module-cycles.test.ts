/** Verifies SDK-free graphs retain every loaded file without enumerating redundant ownership permutations. Synthetic files test collector mechanics, not native SDK acceptance. */
import { dirname, join } from "node:path";
import { writeFileSync } from "node:fs";
import { expect, test } from "bun:test";
import { consumerModulePaths } from "../consumer-module-paths.js";
import type { ConsumerModuleEdge } from "../consumer-module-paths.types.js";
import { moduleGraphFixture } from "./consumer-module-paths.fixture.js";

test("SDK-free package cycles retain bounded complete file ownership", () => {
  const fixture = moduleGraphFixture(3);
  try {
    const [first, middle, last] = fixture.modules;
    if (first === undefined || middle === undefined || last === undefined)
      throw new Error("Expected three owned fixture modules");
    const files = [fixture.entry, ...fixture.modules];
    const edges: ConsumerModuleEdge[] = [{ from: fixture.entry, to: first }];
    let previous = first;
    for (let layer = 0; layer < 256; layer++) {
      const next = join(dirname(first), `next-${layer}.js`);
      const via = layer === 0 ? middle : join(dirname(middle), `via-${layer}.js`);
      writeFileSync(next, "export const next = true;");
      writeFileSync(via, "export const via = true;");
      files.push(next, via);
      edges.push(
        { from: previous, to: next },
        { from: previous, to: via },
        { from: via, to: next },
      );
      previous = next;
    }
    edges.push({ from: previous, to: last });
    const graph = consumerModulePaths(
      fixture.entry,
      files,
      edges,
      fixture.root,
      fixture.installation,
      "declarations",
      "consumer",
    );
    expect(graph.unreached).toEqual([]);
    expect(graph.paths).toHaveLength(515);
    expect(graph.paths).toContainEqual(
      expect.objectContaining({ packages: ["consumer", "fixture-0", "fixture-2"] }),
    );
  } finally {
    fixture.close();
  }
});
