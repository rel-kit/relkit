/** Verifies published documentation against maintained source, layout and catalogs. */
import { expect, test } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  renderCapabilities,
  renderCommandOptions,
  renderRelated,
} from "../scripts/generate-guides.js";
import { markdownFiles, sourceFiles } from "./documentation-fixture.js";
const content = resolve(import.meta.dir, "../content");

test("keeps guides backed by executable examples and self-hosted discovery", async () => {
  const files = await markdownFiles(content);
  const routes = await readFile(resolve(content, "docs/modules/http/routes.mdx"), "utf8");
  const events = await readFile(resolve(content, "docs/modules/events/define.mdx"), "utf8");
  const listeners = await readFile(resolve(content, "docs/modules/events/consume.mdx"), "utf8");
  expect(routes).toContain("examples/commerce/src/routes/orders/[orderId]/route.ts");
  expect(events).toContain("apps/docs/examples/events/order-created.event.ts");
  expect(listeners).toContain("apps/docs/examples/events/order-confirmation.function.ts");
  const config = (await import("../blume.config.js")).default;
  expect(config.content?.root).toBe("content");
  expect(
    config.search && "indexing" in config.search && config.search.indexing?.includeCodeBlocks,
  ).toBe(true);

  for (const file of files.filter((file) => !file.includes("/api/"))) {
    const contents = await readFile(file, "utf8");
    for (const block of contents.matchAll(/^```(?:ts|tsx)[^\n]*\n([\s\S]*?)^```/gm)) {
      expect(block[1]?.split("\n").length).toBeLessThanOrEqual(36);
    }
  }

  for (const removedBundle of [
    "docs/learn/check-build-deploy.mdx",
    "docs/learn/concepts/schemas-errors-context.mdx",
    "docs/modules/http/uploads-middleware-rate-limits.mdx",
    "docs/modules/http/responses-openapi-clients.mdx",
    "resources-ai/buckets-cache.mdx",
    "resources-ai/tools-agents.mdx",
    "async/events.mdx",
    "async/jobs.mdx",
    "async/listeners.mdx",
    "async/schedules.mdx",
    "docs/learn/concepts/providers.mdx",
    "docs/learn/concepts/services.mdx",
    "docs/learn/concepts/domain-first-migration.mdx",
  ]) {
    expect(files).not.toContain(resolve(content, removedBundle));
  }
});

test("documents grouped service roots and rejects removed layer-first advice", async () => {
  const createPage = resolve(content, "docs/learn/create-an-app.mdx");
  const currentSources = [
    ...(await markdownFiles(content)).filter((file) => !file.includes("/api/")),
    ...(await sourceFiles(resolve(import.meta.dir, "../examples/landing"))),
    resolve(import.meta.dir, "../../../docs/getting-started.md"),
    resolve(import.meta.dir, "../../../docs/testing.md"),
  ];
  const legacyPath =
    /(?:^|[\s"'`(])(?:src\/(?:env\.ts|(?:functions|events|agents|jobs|cache|buckets|tools|middleware|transforms|shared)(?:\/|\b))|@app\/(?:functions|events|agents|jobs|cache|buckets|tools|middleware|transforms|shared)(?:\/|\b))/m;

  for (const file of currentSources) {
    expect(await readFile(file, "utf8")).not.toMatch(legacyPath);
  }

  const createSource = await readFile(createPage, "utf8");
  expect(createSource).toContain("src/services/hello/service.ts");
  expect(createSource).toContain("src/routes/hello/route.ts");
  expect(createSource).not.toContain("src/services/service.ts");
});
