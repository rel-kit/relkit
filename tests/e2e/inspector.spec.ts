/** Preserves active capability, unavailable telemetry and raw-route Inspector UI assertions on one owned backend. */
import { expect, test } from "@playwright/test";
import { playwrightSelection } from "../../scripts/playwright-selection.js";
const { backend } = playwrightSelection("inspector");
test.beforeAll(async ({ request }) => {
  // Compile this flow's cold routes outside the separate interaction deadline.
  test.setTimeout(120_000);
  for (const path of [
    "/tools/orders.get.tool",
    "/agents/support.order",
    "/agents/support.order/chat",
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
  }
});
test.beforeEach(async ({ request }) => {
  await request.post(`${backend}/__fixture__/reset`);
});
const graphHash = "sha256:commerce-inspector-fixture-v1";
test("loads the active graph and follows route/detail/composer flows", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText(graphHash).first()).toBeVisible();

  await page.getByRole("link", { name: "Routes" }).click();
  await expect(page.getByRole("heading", { name: "Routes" })).toBeVisible();
  await page.goto("/routes/orders.create.http");
  await expect(page.getByRole("heading", { name: "Route detail" })).toBeVisible();

  await page.getByLabel(/orderId \(header\)/).fill("order-100");
  await page.getByLabel(/customerEmail \(header\)/).fill("buyer@example.com");
  await page.getByLabel(/sku \(body\)/).fill("sku-1");
  await page.getByLabel(/quantity \(body\)/).fill("2");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("heading", { name: "Active backend result" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open request record" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open trace" })).toHaveCount(0);
});

test("keeps contracts available when observability is unavailable", async ({ page }) => {
  await page.route(/\/_relkit\/v1\/(?:requests|logs|traces)(?:\?|$)/, (route) => route.abort());

  await page.goto("/routes/orders.create.http");
  await expect(page.getByRole("heading", { name: "Route detail" })).toBeVisible();
  await page.goto("/functions/orders.create");
  await expect(page.getByRole("heading", { name: "Function detail" })).toBeVisible();
  await page.goto("/tools/orders.get.tool");
  await expect(page.getByRole("heading", { name: "Tool detail" })).toBeVisible();
  await page.goto("/agents/support.order");
  await expect(page.getByRole("heading", { name: "Agent detail" })).toBeVisible();
  await page.getByRole("link", { name: "Open chat" }).click();
  await expect(page).toHaveURL(/\/agents\/support\.order\/chat(?:\?|$)/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "support.order" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conversation" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Agent activity" })).toBeVisible();
});

test("opens raw route details without looking up a nonexistent function", async ({ page }) => {
  const functionRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/functions/raw.details")) functionRequests.push(request.url());
  });
  await page.route("**/_relkit/v1/routes/raw.details", (route) =>
    route.fulfill({
      json: {
        protocol: "relkit.inspector",
        version: 1,
        node: {
          id: "raw.details",
          kind: "trigger",
          targetFunctionId: "raw.details",
          config: {
            method: "GET",
            path: "/users/:id/details",
            rawHandler: true,
            request: null,
            responses: [],
            middleware: [],
            transforms: [],
          },
        },
      },
    }),
  );
  await page.goto("/routes/raw.details");
  await expect(page.getByRole("heading", { name: "Route detail", exact: true })).toBeVisible();
  await expect(page.getByText("Raw HTTP handler").first()).toBeVisible();
  await expect(page.getByText("The route API is unavailable.")).toHaveCount(0);
  expect(functionRequests).toEqual([]);
});

test("keeps critical controls usable on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/routes/orders.create.http");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send request" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
