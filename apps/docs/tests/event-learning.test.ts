import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { icons } from "lucide-react";
import { eventGuideGroup } from "../scripts/event-guide-catalog.js";
import { generateGuides, renderRelated } from "../scripts/generate-guides.js";
import { guideRelations } from "../scripts/guide-catalog.js";
import { getCliHelpModel } from "@relkit/cli/help";

test("places Events after HTTP Routes and gives every section a supported icon", async () => {
  const output = new Map<string, string>();
  await generateGuides(
    resolve(import.meta.dir, "../../.."),
    resolve(import.meta.dir, "../content/docs"),
    getCliHelpModel("test"),
    async (path, value) => {
      output.set(path, value);
    },
  );

  const sections: string[] = JSON.parse(output.get("meta.json")!).pages;
  expect(sections.slice(0, 5)).toEqual(["index", "start", "service", "http", "events"]);
  expect(JSON.parse(output.get("start/meta.json")!).pages).not.toContain("events");
  expect(output.has("start/events/meta.json")).toBe(false);
  expect(JSON.parse(output.get("events/meta.json")!)).toEqual({
    title: "Events",
    icon: "Radio",
    pages: ["index", "define", "publish", "consume", "first-event"],
  });
  for (const page of eventGuideGroup.pages) {
    expect(output.has(`../generated/related/events-${page}.mdx`)).toBe(true);
  }
  for (const section of sections.filter((section) => section !== "index")) {
    const metadata = JSON.parse(output.get(`${section}/meta.json`)!);
    expect(metadata.icon).toBeString();
    expect(icons).toHaveProperty(metadata.icon);
  }
  const lastHttpPage = guideRelations.find(({ path }) => path === "http/first-route")!;
  expect(renderRelated(lastHttpPage)).toContain("[Events](/docs/events)");
  expect(renderRelated(lastHttpPage)).not.toContain("/docs/events/index");
});

test("keeps section headings for the Events guides' right-side table of contents", async () => {
  for (const page of ["define", "publish", "consume"]) {
    const source = await Bun.file(
      resolve(import.meta.dir, `../content/docs/events/${page}.mdx`),
    ).text();
    expect((source.match(/^## .+$/gm) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(source).not.toContain("content/generated/related/");
  }
});

test("introduces the Events API and shows subscribers before the existing-app tutorial", async () => {
  const content = resolve(import.meta.dir, "../content/docs/events");
  const overview = await Bun.file(resolve(content, "index.mdx")).text();
  expect(overview).toContain("title: Getting started");
  for (const api of ["defineEvent", "defineFunction", "defineEventFunction"]) {
    expect(overview).toContain(`\`${api}\``);
  }
  expect(overview).toContain("/docs/events/define");
  expect(overview).toContain("/inspector-event-subscribers.jpg");
  expect(
    await Bun.file(resolve(import.meta.dir, "../public/inspector-event-subscribers.jpg")).exists(),
  ).toBe(true);

  const definition = await Bun.file(resolve(content, "define.mdx")).text();
  expect(definition).toContain("title: Define an event");
  expect(definition).toContain("Use `defineEvent`");
  expect(definition).toContain('<include cwd lang="ts"');
  expect(definition).toContain("templates/default/v1/api/src/orders/events/order-created.event.ts");
  expect(definition).toContain("bun run check");
  expect(definition).not.toContain("<ImageZoom");

  const tutorial = await Bun.file(resolve(content, "first-event.mdx")).text();
  expect(tutorial).toContain("existing RelKit app");
  expect(tutorial).not.toContain("create-relkit");
  expect(tutorial).not.toContain("cp .env");
  expect(tutorial).toContain("src/routes/orders/route.ts");
  expect(tutorial).toContain("order.confirmation.requested");
});
