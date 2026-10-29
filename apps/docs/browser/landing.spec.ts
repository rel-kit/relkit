/** Keeps the preserved React landing interactive inside the Astro document. */
import { expect, test } from "@playwright/test";

test("landing retains keyboard tabs, persisted pause and global search", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Routes", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Agent", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "Pause connections animation" }).click();
  await expect(page.getByRole("button", { name: "Play connections animation" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: "Play connections animation" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox").fill("upload file");
  await expect(
    page
      .locator('[data-blume-search-results] a[href="/guides/storage/upload-product-images"]')
      .first(),
  ).toContainText("Guides");
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
});

test("mobile landing respects reduced motion and keeps example tabs usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: "Routes", exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Next tabs", exact: true }).click();
  await expect(page.getByRole("button", { name: "Previous tabs", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
    true,
  );
});

test("landing and docs retain canonical and social metadata", async ({ page, request }) => {
  for (const path of [
    "/",
    "/docs/learn/create-an-app",
    "/docs/modules/storage",
    "/guides/storage/upload-product-images",
    "/docs/api/buckets",
  ]) {
    await page.goto(path);
    const title = await page.title();
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description?.length).toBeGreaterThan(20);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", title);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
      "content",
      description!,
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://relkit.dev${path}`,
    );
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(image).toBeTruthy();
    expect((await request.get(new URL(image!).pathname)).ok()).toBe(true);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
  }
});

test("navigation between docs and the landing preserves hydration and styling", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/docs/modules/storage");
  await page.getByRole("banner").getByRole("link", { name: "RELKIT", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3002/");
  await expect(page.getByRole("tab", { name: "Routes", exact: true })).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('header a[href="/docs"]').first().click();
  await expect(page).toHaveURL("http://127.0.0.1:3002/docs");
  await expect(
    page.getByRole("heading", { name: /Build your first\s*TypeScript API/ }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
