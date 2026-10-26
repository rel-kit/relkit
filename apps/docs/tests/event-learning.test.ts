import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { icons } from "lucide-react";
import { eventGuideGroup } from "../scripts/event-guide-catalog.js";
import { generateGuides, renderRelated } from "../scripts/generate-guides.js";
import { guideGroups, guideRelations } from "../scripts/guide-catalog.js";
import { getCliHelpModel } from "@relkit/cli/help";

test("preserves navigation ordering and emits Blume-compatible section icons", async () => {
  const output = new Map<string, string>();
  await generateGuides(
    resolve(import.meta.dir, "../../.."),
    resolve(import.meta.dir, "../content"),
    getCliHelpModel("test"),
    async (path, value) => {
      output.set(path, value);
    },
  );

  expect(output.has("docs/modules/events/meta.ts")).toBe(true);
  expect(output.has("docs/learn/meta.ts")).toBe(true);
  expect(output.has("start/events/meta.json")).toBe(false);
  for (const { directory, pages } of guideGroups) {
    const source = output.get(`${directory}/meta.ts`)!;
    expect(source).toContain(`"pages":${JSON.stringify(pages)}`);
    const icon = source.match(/"icon":"([^"]+)"/)?.[1];
    expect(icon).toMatch(/^[a-z]+(?:-[a-z0-9]+)*$/);
    const name = icon!
      .split("-")
      .map((part) => part[0]!.toUpperCase() + part.slice(1))
      .join("");
    expect(icons[name as keyof typeof icons]).toBeDefined();
  }
  expect(output.get("docs/modules/storage/meta.ts")).toContain('"icon":"hard-drive"');
  expect(output.get("docs/modules/auth/meta.ts")).toContain('"icon":"shield-check"');
  const meta = (await import("../content/docs/modules/events/meta.js")).default;
  expect(meta).toMatchObject({
    title: "Events",
    display: "page",
    pages: ["index", "define", "publish", "consume"],
  });
  for (const page of eventGuideGroup.pages) {
    expect(output.has(`_snippets/generated/related/docs-modules-events-${page}.mdx`)).toBe(true);
  }
  const lastHttpPage = guideRelations.find(({ path }) => path === "docs/modules/http/first-route")!;
  expect(renderRelated(lastHttpPage)).not.toContain("Next step");
});

test("keeps section headings for the Events guides' right-side table of contents", async () => {
  for (const page of ["define", "publish", "consume"]) {
    const source = await Bun.file(
      resolve(import.meta.dir, `../content/docs/modules/events/${page}.mdx`),
    ).text();
    expect((source.match(/^## .+$/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).not.toContain("/_snippets/generated/related/");
  }
});

test("introduces the Events API and shows subscribers before the existing-app tutorial", async () => {
  const content = resolve(import.meta.dir, "../content/docs/modules/events");
  const overview = await Bun.file(resolve(content, "index.mdx")).text();
  expect(overview).toContain("title: Events overview");
  for (const api of ["defineEvent", "defineFunction", "defineEventFunction"]) {
    expect(overview).toContain(`\`${api}\``);
  }
  expect(overview).toContain("/docs/modules/events/define");
  expect(overview).toContain("/inspector-event-subscribers.jpg");
  expect(
    await Bun.file(resolve(import.meta.dir, "../public/inspector-event-subscribers.jpg")).exists(),
  ).toBe(true);

  const definition = await Bun.file(resolve(content, "define.mdx")).text();
  expect(definition).toContain("title: Define an event");
  expect(definition).toContain("Use `defineEvent`");
  expect(definition).toMatch(/<include\s+source=/);
  expect(definition).toContain("apps/docs/examples/events/order-created.event.ts");
  expect(definition).toContain("bun run check");
  expect(definition).not.toContain("<ImageZoom");

  const tutorial = await Bun.file(
    resolve(import.meta.dir, "../content/guides/events/react-to-order-events.mdx"),
  ).text();
  expect(tutorial).toContain("existing RELKIT app");
  expect(tutorial).not.toContain("create-relkit");
  expect(tutorial).not.toContain("cp .env");
  expect(tutorial).toContain("src/routes/orders/route.ts");
  expect(tutorial).toContain("order.confirmation.requested");
});
