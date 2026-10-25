/** Protects native Blume presentation without losing keyboard access, examples or deep links. */
import { expect, test } from "@playwright/test";

test("section navigation and grouped capability cards render meaningful icons", async ({
  page,
}) => {
  await page.goto("/docs/modules");
  for (const name of ["Learn", "Modules", "Guides", "Reference"]) {
    const link = page.getByRole("link", { name, exact: true }).filter({ visible: true }).first();
    await expect(link.locator("svg")).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "Data and background work" })).toBeVisible();
  const bucket = page.locator('main a[href="/docs/modules/storage"]');
  await expect(bucket).toContainText("Store files");
  await expect(bucket.locator("svg").first()).toBeVisible();
  await bucket.press("Enter");
  await expect(page).toHaveURL(/\/docs\/modules\/storage$/);
  await expect(page.getByText("Start here", { exact: true })).toBeVisible();
});

test("walkthrough steps retain numbered headings and direct anchors", async ({ page }) => {
  await page.goto("/guides/cli/create-and-build-an-api#check-the-application");
  await expect(page.locator("[data-blume-step]")).toHaveCount(5);
  await expect(page.locator("#check-the-application")).toBeInViewport();
  await expect(page.locator("#check-the-application")).toContainText("3. Check the application");
  await expect(page.locator("[data-blume-step]").first().locator("svg").first()).toBeVisible();
  await expect(page.getByText("Before you begin", { exact: true })).toBeVisible();
});

test("next actions stay visible while optional source links open with the keyboard", async ({
  page,
  request,
}) => {
  await page.goto("/docs/learn/create-an-app");
  const next = page
    .getByRole("navigation", { name: "Pagination", exact: true })
    .getByRole("link", { name: "Next Add an Orders endpoint", exact: true });
  await expect(next).toContainText("Add an Orders endpoint");
  await expect(next.locator("svg").first()).toBeVisible();
  const sources = page.locator("details[data-blume-accordion]");
  await expect(sources).not.toHaveAttribute("open");
  await sources.locator("summary").press("Enter");
  await expect(sources).toHaveAttribute("open");
  await expect(sources.getByRole("link").first()).toBeVisible();
  const markdown = await (await request.get("/docs/learn/create-an-app.md")).text();
  expect(markdown).toContain("/docs/learn/first-route");
  expect(markdown).toContain("Reference and source");
  expect(markdown).toContain("github.com/rel-kit/relkit");
});

test("tutorial navigation has one row with previous on the left and next on the right", async ({
  page,
}, testInfo) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.goto("/docs/learn/first-route");
      const pagination = page.getByRole("navigation", { name: "Pagination", exact: true });
      const previous = pagination.getByRole("link", {
        name: "Previous Create and run an API",
        exact: true,
      });
      const next = pagination.getByRole("link", {
        name: "Next Save and retrieve orders",
        exact: true,
      });
      await expect(page.locator('main a[href="/docs/learn/save-orders"]')).toHaveCount(1);
      await pagination.scrollIntoViewIfNeeded();
      const previousBox = await previous.boundingBox();
      const nextBox = await next.boundingBox();
      if (!previousBox || !nextBox) throw new Error("Tutorial navigation must be visible.");
      expect(previousBox.x + previousBox.width).toBeLessThan(nextBox.x);
      expect(previousBox.y).toBe(nextBox.y);
      await expect(next).toHaveCSS("text-align", "end");
      await expect(previous.locator(":scope > svg:first-child")).toBeVisible();
      await expect(next.locator(":scope > svg:last-child")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await pagination.screenshot({
        path: testInfo.outputPath(`tutorial-navigation-${width}-${colorScheme}.png`),
      });
    }
  }
  await page
    .getByRole("link", { name: "Next Save and retrieve orders", exact: true })
    .press("Enter");
  await expect(page).toHaveURL(/\/docs\/learn\/save-orders$/);
  await page
    .getByRole("link", { name: "Previous Add an Orders endpoint", exact: true })
    .press("Enter");
  await expect(page).toHaveURL(/\/docs\/learn\/first-route$/);
});

test("alternative setup tabs support keyboard selection and preserve both Markdown recipes", async ({
  page,
  request,
}) => {
  await page.goto("/docs/modules/integrations");
  const redis = page.getByRole("tab", { name: "Docker Redis", exact: true });
  const cloudflare = page.getByRole("tab", { name: "Cloudflare KV/R2", exact: true });
  await expect(redis).toHaveAttribute("aria-selected", "true");
  await redis.press("ArrowRight");
  await expect(cloudflare).toBeFocused();
  await expect(cloudflare).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Cloudflare KV/R2", exact: true })).toContainText(
    "@relkit/cloudflare",
  );
  await cloudflare.press("Home");
  await expect(redis).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Docker Redis", exact: true })).toContainText(
    "@relkit/redis",
  );
  const markdown = await (await request.get("/docs/modules/integrations.md")).text();
  for (const text of ["Docker Redis", "Cloudflare KV/R2", "@relkit/redis", "@relkit/cloudflare"])
    expect(markdown).toContain(text);
  expect(markdown).not.toContain("<include");
});

test("native presentation fits mobile layouts in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const route of [
      "/docs/modules",
      "/docs/modules/cli",
      "/guides/cli/create-and-build-an-api",
      "/docs/modules/integrations",
      "/docs/modules/database",
      "/docs/modules/storage/local-storage",
      "/docs/modules/realtime/providers",
      "/guides/storage/upload-product-images",
    ]) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
});

test("module walkthroughs preserve their outlines and related guide links", async ({ page }) => {
  for (const [route, heading, count] of [
    ["/docs/modules/storage/local-storage", "add-the-provider-profile", 3],
    ["/docs/modules/auth/better-auth", "mount-the-native-handler", 3],
    ["/docs/modules/database/define", "generate-the-typed-application-context", 4],
    ["/docs/modules/client", "pull-the-public-contract", 4],
    ["/docs/modules/realtime", "publish-an-update", 3],
    ["/docs/modules/ai/function-tools", "turn-it-into-a-tool", 3],
    ["/docs/modules/jobs/providers/inngest", "start-and-submit-a-run", 5],
    ["/docs/modules/operations/inspector", "follow-a-request", 3],
  ] as const) {
    await page.goto(`${route}#${heading}`);
    await expect(page.locator("[data-blume-step]")).toHaveCount(count);
    await expect(page.locator(`#${heading}`)).toBeInViewport();
    await expect(page.locator(`[data-blume-step] #${heading}`)).toBeVisible();
  }
  await page.goto("/docs/modules/database#find-the-guide-for-your-task");
  const transaction = page.locator(
    '[data-blume-card] a[href="/docs/modules/database/transactions"]',
  );
  await transaction.press("Enter");
  await expect(page).toHaveURL(/\/docs\/modules\/database\/transactions$/);
  await expect(page.getByText("Before you begin", { exact: true })).toBeVisible();
  await page.goto("/guides/storage/upload-product-images#related-tasks");
  await page
    .locator('[data-blume-card] a[href="/docs/modules/storage/read-delete"]')
    .press("Enter");
  await expect(page).toHaveURL(/\/docs\/modules\/storage\/read-delete$/);
});

test("realtime setup alternatives retain keyboard access and both Markdown recipes", async ({
  page,
  request,
}) => {
  await page.goto("/docs/modules/realtime/providers#configure-the-application");
  const local = page.getByRole("tab", { name: "Local filesystem", exact: true });
  const redis = page.getByRole("tab", { name: "Connected Redis", exact: true });
  await expect(local).toHaveAttribute("aria-selected", "true");
  await local.press("ArrowRight");
  await expect(redis).toBeFocused();
  await expect(page.getByRole("tabpanel", { name: "Connected Redis", exact: true })).toContainText(
    "@relkit/redis",
  );
  await redis.press("Home");
  await expect(page.getByRole("tabpanel", { name: "Local filesystem", exact: true })).toContainText(
    "@relkit/local",
  );
  const markdown = await (await request.get("/docs/modules/realtime/providers.md")).text();
  for (const text of ["Local filesystem", "Connected Redis", "@relkit/local", "@relkit/redis"])
    expect(markdown).toContain(text);
  expect(markdown).not.toContain("<include");
});
