/** Checks the Labs badge on Labs pages and in the sidebar, and the published maturity table. */
import { expect, test } from "@playwright/test";

test("the realtime guide shows the Labs badge on the page and in the sidebar", async ({ page }) => {
  await page.goto("/docs/modules/realtime");
  const notice = page.locator("[data-labs-badge]");
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Labs");
  await expect(notice).toContainText("can change in any release");
  await expect(notice.getByRole("link")).toHaveAttribute("href", "/docs/maturity");
  const sidebar = page.getByRole("complementary", { name: "Primary", exact: true });
  const row = sidebar.locator('a[href="/docs/modules/realtime"]').first();
  await expect(row).toContainText("Realtime");
  await expect(row).toContainText("Labs");
});

test("a Core guide shows no Labs badge", async ({ page }) => {
  await page.goto("/docs/modules/storage");
  await expect(page.locator("[data-labs-badge]")).toHaveCount(0);
});

test("the maturity page lists Core and Labs features", async ({ page }) => {
  await page.goto("/docs/maturity");
  await expect(page.getByRole("heading", { level: 1, name: "Core and Labs" })).toBeVisible();
  const core = page.locator("table").first();
  const labs = page.locator("table").nth(1);
  await expect(core).toContainText("Built-in telemetry");
  for (const feature of [
    "Realtime",
    "AWS hosting",
    "Inngest job adapter",
    "Trigger.dev job adapter",
    "Effect MQ job adapter",
    "Agent adapters (LangChain and DeepAgents)",
    "Graph workflows",
  ])
    await expect(labs).toContainText(feature);
  await expect(
    page
      .getByRole("complementary", { name: "Primary", exact: true })
      .locator('a[href="/docs/maturity"]'),
  ).toBeVisible();
});
