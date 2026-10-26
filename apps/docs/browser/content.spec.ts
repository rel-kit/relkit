/** Checks served HTML, Markdown and anchors from the same authored route inventory. */
import { expect, test } from "@playwright/test";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

test("every page serves expanded examples, sidebar icons and working internal anchors", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const files = await readdir(resolve(import.meta.dirname, "../content"), { recursive: true });
  const routes = files
    .filter((file) => /^(docs|guides)\//.test(file) && file.endsWith(".mdx"))
    .map((file) => `/${file.replace(/\.mdx$/, "").replace(/\/index$/, "")}`);
  const documents: { route: string; html: string }[] = [];
  for (const route of routes) {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.status(), route).toBe(200);
    const html = await response.text();
    expect(html, route).toContain("<h1");
    documents.push({ route, html });
    const markdown = await request.get(`${route}.md`);
    expect(markdown.ok(), `${route}.md`).toBe(true);
    expect(await markdown.text(), `${route}.md`).not.toMatch(/<include\b/);
  }
  await page.goto("/docs");
  const broken = await page.evaluate((pages) => {
    const parsed = new Map(
      pages.map(({ route, html }) => [route, new DOMParser().parseFromString(html, "text/html")]),
    );
    const failures: string[] = [];
    for (const [route, document] of parsed) {
      for (const link of document.querySelectorAll("a.blume-nav-link")) {
        if (!link.querySelector("svg"))
          failures.push(`${route}: missing icon for ${link.textContent}`);
      }
      for (const link of document.querySelectorAll("a[href]")) {
        const target = new URL(link.getAttribute("href")!, `${location.origin}${route}`);
        if (target.origin !== location.origin || !target.hash || !parsed.has(target.pathname))
          continue;
        if (!parsed.get(target.pathname)!.getElementById(decodeURIComponent(target.hash.slice(1))))
          failures.push(`${route} → ${target.pathname}${target.hash}`);
      }
    }
    return failures;
  }, documents);
  expect(broken).toEqual([]);
});
