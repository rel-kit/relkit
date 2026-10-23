/** Preserves live request, pause/resume and correlated failure assertions on this invocation's exact backend. */
import { expect, test } from "@playwright/test";
import { playwrightSelection } from "../../scripts/playwright-selection.js";
const { backend } = playwrightSelection("inspector");
test.beforeEach(async ({ request }) => {
  await request.post(`${backend}/__fixture__/reset`);
});
test("shows a new request live and renders its correlated timeline and edges", async ({
  page,
  request,
}) => {
  await page.goto("/requests");
  await expect(page.getByRole("heading", { name: "Requests" })).toBeVisible();
  await expect(page.getByText("Live: connected", { exact: true })).toBeVisible();
  await request.post(`${backend}/orders`, {
    data: { sku: "sku-live", quantity: 1 },
    headers: { "idempotency-key": "order-live", "x-customer-email": "buyer@example.com" },
  });
  await expect(page.getByText("request-live-0002")).toBeVisible();

  await page.getByRole("link", { name: "Open request" }).first().click();
  await expect(page.getByRole("heading", { name: "Request detail" })).toBeVisible();
  await expect(page.getByText("orders.create").first()).toBeVisible();
  await expect(page.getByText("prices.getOrSet").first()).toBeVisible();

  await page.getByRole("link", { name: "Functions" }).click();
  await page.getByRole("link", { name: "Open function" }).first().click();
  await expect(page.getByRole("heading", { name: "Declared edges" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Observed recent edges" })).toBeVisible();
  await expect(page.getByText("cache.get")).toBeVisible();

  await page.getByRole("link", { name: "Logs" }).click();
  await expect(page.getByRole("heading", { name: "Logs" })).toBeVisible();
  await expect(page.getByText("Order request completed.")).toBeVisible();
  await page.getByRole("button", { name: "Order request completed." }).click();
  await expect(page.getByRole("link", { name: "Open full trace" })).toBeVisible();
  await page.getByRole("button", { name: "Close log details" }).click();

  await page.getByRole("link", { name: "Traces" }).click();
  await expect(page.getByRole("heading", { name: "Traces" })).toBeVisible();
  await page.locator('[data-trace-id="00000000000000000000000000000002"]').click();
  await expect(page.getByRole("link", { name: "Open full trace" })).toBeVisible();
  await page.getByRole("link", { name: "Open full trace" }).click();
  await expect(page.getByRole("heading", { name: "Trace detail" })).toBeVisible();
});

test("follows a paused request through completion and linked work", async ({ page, request }) => {
  await page.goto("/requests");
  const pending = request.post(`${backend}/__fixture__/paused`);
  await expect(page.getByText("request-paused-0001")).toBeVisible();
  await page.getByRole("link", { name: "Open request" }).first().click();

  await expect(page.getByRole("heading", { name: "Request detail" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Request timeline" })).toBeVisible();
  await expect(page.getByText("In progress").first()).toBeVisible();
  await page.getByRole("button", { name: "Inspect HTTP POST /orders" }).click();
  const spanDialog = page.getByRole("dialog", { name: "HTTP POST /orders" });
  await expect(spanDialog).toBeVisible();
  await spanDialog.getByRole("tab", { name: "Metadata" }).click();
  await expect(spanDialog.getByText(/relkit\.request\.id/)).toBeVisible();
  await spanDialog.getByRole("tab", { name: "Events" }).click();
  await expect(spanDialog.getByText(/http\.request\.received/)).toBeVisible();

  await request.post(`${backend}/__fixture__/release`);
  await pending;
  await expect(page.getByText("http.response.completed", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Continuations" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open trace" })).toBeVisible();

  await page.reload();
  await expect(page.getByText("request-paused-0001").first()).toBeVisible();
  await expect(page.getByText("http.request.received", { exact: false })).toHaveCount(1);
  await page.getByRole("link", { name: /222222222222/ }).click();
  await expect(page.getByRole("heading", { name: "Trace detail" })).toBeVisible();
});

test("pinpoints failed, timed out, cancelled, and incomplete requests", async ({
  page,
  request,
}) => {
  for (const outcome of ["defect", "timeout", "cancelled"] as const) {
    await request.post(`${backend}/__fixture__/outcome/${outcome}`);
    await page.goto(`/requests/request-${outcome}`);
    await expect(page.getByRole("heading", { name: "Request detail" })).toBeVisible();
    await expect(page.getByText(outcome, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Incomplete telemetry: missing-parent/)).toBeVisible();
    await page.getByRole("button", { name: "Inspect HTTP POST /orders" }).click();
    await page.getByRole("tab", { name: "Metadata" }).click();
    await expect(page.getByText(/"attributes": 2/)).toBeVisible();
  }
});
