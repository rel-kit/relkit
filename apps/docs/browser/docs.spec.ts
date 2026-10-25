/** Verifies reader journeys through native Blume navigation, discovery and copied examples. */
import { expect, test } from "@playwright/test";
import redirects from "../redirects.json" with { type: "json" };

test("legacy URLs resolve directly, including their target anchors", async ({ request, page }) => {
  test.setTimeout(120_000);
  for (const { from, to, status } of redirects) {
    const response = await request.get(from, { maxRedirects: 0 });
    expect(response.status(), from).toBe(status);
    const location = new URL(response.headers().location!, "http://127.0.0.1:3002");
    expect(location.pathname + location.hash, from).toBe(to);
    expect((await request.get(location.pathname, { maxRedirects: 0 })).status(), to).toBe(200);
    if (location.hash) {
      await page.goto(location.pathname);
      await expect(
        page.locator(`[id="${decodeURIComponent(location.hash.slice(1))}"]`),
      ).toHaveCount(1);
    }
  }
});

test("search exposes authored sections and supports keyboard selection", async ({ page }) => {
  await page.goto("/docs");
  for (const [query, path, section] of [
    ["create app", "/docs/learn/create-an-app", "Learn"],
    ["bucket configuration", "/docs/modules/storage", "Modules"],
    ["upload file", "/guides/storage/upload-product-images", "Guides"],
    ["defineBucket", "/docs/modules/storage/define", "Modules"],
    ["defineApp", "/docs/learn/concepts/application", "Learn"],
    ["defineEnv", "/docs/learn/concepts/environment", "Learn"],
    ["defineConfig", "/docs/learn/concepts/application", "Learn"],
  ]) {
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByRole("combobox").fill(query!);
    const result = page.locator(`[data-blume-search-results] a[href="${path}"]`).first();
    await expect(result).toBeVisible();
    await expect(result).toContainText(section!);
    if (query === "create app")
      await expect(page.locator("[data-blume-search-results] a").first()).toHaveAttribute(
        "href",
        path!,
      );
    // Native search inputs clear their query before Escape dismisses the dialog.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("combobox")).toHaveValue("");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("combobox")).not.toBeVisible();
  }
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox").fill("create app");
  await expect(
    page.locator('[data-blume-search-results] a[href="/docs/learn/create-an-app"]').first(),
  ).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/docs\/learn\/create-an-app/);
});

test("modules have contextual navigation and guides have curated next actions", async ({
  page,
}) => {
  await page.goto("/docs/modules/storage/define");
  await expect(
    page
      .getByRole("complementary", { name: "Primary", exact: true })
      .locator("details")
      .filter({ has: page.locator('summary a[href="/docs/modules/storage"]') })
      .last(),
  ).toHaveAttribute("open");
  await expect(
    page.getByRole("link", { name: "Configure local storage", exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "On this page", exact: true }),
  ).toBeVisible();
  await page.goto("/guides/storage/upload-product-images");
  await expect(page.getByRole("heading", { name: /^Related tasks/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Pagination", exact: true })).toHaveCount(0);
  await page.goto("/docs/learn/create-an-app");
  await expect(page.getByRole("link", { name: /Add an Orders endpoint/ }).first()).toBeVisible();
});

test("configuration APIs are reachable directly from the reference overview", async ({ page }) => {
  for (const [name, path] of [
    ["defineApp", "app"],
    ["defineEnv", "config"],
  ]) {
    await page.goto("/docs/api");
    await page.getByRole("link", { name: name!, exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/docs/api/${path}#${name!.toLowerCase()}$`));
    await expect(page.locator(`#${name!.toLowerCase()}`)).toBeVisible();
  }
});

test("public exports lead from package imports to React, provider, testing and tooling contracts", async ({
  page,
}) => {
  for (const [name, slug] of [
    ["RelkitClientProvider", "client"],
    ["useRelkitClient", "client"],
    ["defineProviderAdapter", "provider"],
    ["createTestBucketFake", "testing"],
    ["normalizeCreateOptions", "create-relkit"],
  ]) {
    await page.goto(`/docs/api/${slug}#all-exported-apis`);
    const link = page.getByRole("table").getByRole("link", { name: name!, exact: true }).first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute("href");
    await link.click();
    await expect(page.locator(`[id="${href!.split("#")[1]}"]`)).toBeVisible();
    await expect(page.locator('main a[href^="/docs/modules/"]').first()).toHaveAttribute(
      "href",
      /^\/docs\/modules\//,
    );
  }
  await page.goto("/docs/api/public");
  await expect(page.getByRole("heading", { level: 1, name: "All public APIs" })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("@relkit/client/react");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("search excludes references and suggests authored API and CLI usage", async ({ page }) => {
  await page.goto("/docs");
  for (const [query, path] of [
    ["RelkitClientProvider", "/docs/modules/client"],
    ["defineProviderAdapter", "/docs/modules/integrations/provider-authoring"],
    ["createTestBucketFake", "/docs/modules/operations/testing"],
    ["normalizeCreateOptions", "/docs/modules/cli/automation"],
    ["CLI", "/docs/modules/cli"],
  ]) {
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("dialog").locator('a[href^="/docs/api"]')).toHaveCount(0);
    await page.getByRole("combobox").fill(query!);
    await expect(
      page.locator(`[data-blume-search-results] a[href="${path}"]`).first(),
    ).toBeVisible();
    await expect(page.getByRole("dialog").locator('a[href^="/docs/api"]')).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  }
});

test("examples and page Markdown copy expanded source", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/guides/storage/upload-product-images");
  await page.getByRole("button", { name: "Copy code", exact: true }).first().click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("bun add");
  await page.getByRole("button", { name: "Copy as Markdown", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("defineBucket");
  const markdown = await request.get("/guides/storage/upload-product-images.md");
  expect(markdown.ok()).toBe(true);
  expect(await markdown.text()).not.toContain("<include");
  expect(await markdown.text()).toContain("uploadAssets");
});

test("mobile navigation reaches a module without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/docs/modules/storage");
  await page.getByRole("button", { name: "Toggle navigation", exact: true }).click();
  await page
    .getByRole("complementary", { name: "Primary", exact: true })
    .getByRole("link", { name: "Configure local storage", exact: true })
    .click();
  await expect(page).toHaveURL(/\/docs\/modules\/storage\/local-storage/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
