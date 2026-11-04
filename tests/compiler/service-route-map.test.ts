/** A default-exported `defineServiceRoutes` map compiles to the same routes as `defineRoute` exports. */
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { compileProject } from "./fixture-runner.ts";

test("a default service route map and individual defineRoute exports produce the same routes", async () => {
  const result = await compileProject(
    "service-route-map",
    resolve(import.meta.dir, "fixtures/service-route-map"),
  );
  expect(result.diagnostics).toEqual([]);
  const graph = JSON.parse(result.graphBytes) as {
    readonly nodes: readonly Record<string, unknown>[];
    readonly edges: readonly Record<string, unknown>[];
  };
  const routes = (file: string) =>
    graph.nodes
      .filter((node) => node.kind === "trigger" && String(node.id).endsWith(`.${file}`))
      .map((node) => {
        const config = { ...(node.config as Record<string, unknown>) };
        delete config.path;
        delete config.runtimePaths;
        const { id: _id, source: _source, config: _config, ...rest } = node;
        return { ...rest, config };
      });
  expect(routes("map")).toHaveLength(2);
  expect(routes("map")).toEqual(routes("single"));
  expect(result.manifest).toContain('["default"]["GET"]');
  expect(result.manifest).toContain('["default"]["POST"]');
});
