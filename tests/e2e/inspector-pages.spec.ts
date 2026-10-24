/** Preserves every required capability page, event/job action, diagnostic and editor-link assertion. */
import { expect, test } from "@playwright/test";
import { playwrightSelection } from "../../scripts/playwright-selection.js";
const { backend } = playwrightSelection("inspector");
test.beforeEach(async ({ request }) => {
  await request.post(`${backend}/__fixture__/reset`);
});
const graphHash = "sha256:commerce-inspector-fixture-v1";
const pages = [
  ["/", "Overview"],
  ["/graph", "Graph"],
  ["/routes", "Routes"],
  ["/functions", "Functions"],
  ["/jobs", "Jobs"],
  ["/events", "Events"],
  ["/buckets", "Buckets"],
  ["/cache", "Cache"],
  ["/tools", "Tools"],
  ["/agents", "Agents"],
  ["/requests", "Requests"],
  ["/logs", "Logs"],
  ["/traces", "Traces"],
  ["/env", "Environment"],
  ["/diagnostics", "Diagnostics"],
] as const;

// Each cold Next compilation gets the existing per-test deadline.
for (const [path, heading] of pages) {
  test(`renders the ${heading} inspector page`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  });
}

test("opens bucket, cache, and tool details from their resource pages", async ({ page }) => {
  test.slow();
  await page.goto("/buckets");
  await expect(page.getByRole("link", { name: "Open bucket" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Open bucket" }).first().click();
  await expect(page.getByRole("heading", { name: "Bucket detail" })).toBeVisible();

  await page.goto("/cache");
  await expect(page.getByRole("link", { name: "Open cache" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Open cache" }).first().click();
  await expect(page.getByRole("heading", { name: "Cache detail" })).toBeVisible();

  await page.goto("/tools");
  await expect(page.getByRole("link", { name: "Open tool" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Open tool" }).first().click();
  await expect(page.getByRole("heading", { name: "Tool detail" })).toBeVisible();
});

test("uses event terminology on event details", async ({ page }) => {
  await page.goto("/events");
  await page.getByRole("link", { name: "Open event" }).first().click();
  await expect(page.getByRole("heading", { name: "Event detail" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Consumer functions" })).toBeVisible();
  await expect(page.getByText(/event-only functions/)).toBeVisible();
  await expect(page.getByText(/subscription/i)).toHaveCount(0);
});

test("retries a dead-lettered local job", async ({ page }) => {
  await page.goto("/events");
  await page.getByRole("link", { name: "Jobs" }).click();
  await page.getByRole("link", { name: "Open job" }).first().click();
  await page.getByRole("button", { name: "Retry dead letter" }).click();
  await expect(page.getByRole("dialog", { name: "Retry dead-lettered job?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Retry job" }).click();
  await expect(page.getByText(/available/).first()).toBeVisible();
});

test("shows candidate diagnostics beside the active generation", async ({ page }) => {
  await page.goto("/jobs");
  await page.getByRole("link", { name: "Diagnostics" }).click();
  await expect(page.getByRole("heading", { name: "Active generation" })).toBeVisible();
  await page.request.post(`${backend}/__fixture__/candidate`, { data: { invalid: true } });
  await expect(page.getByRole("heading", { name: "Candidate diagnostics" })).toBeVisible();
  await expect(page.getByText("commerce-generation-1").first()).toBeVisible();
  await expect(page.getByText(graphHash).first()).toBeVisible();
  await expect(page.getByText("commerce-candidate-2")).toBeVisible();
});

test("keeps agent tools available after candidate rejection", async ({ page }) => {
  await page.goto("/diagnostics");
  await page.request.post(`${backend}/__fixture__/candidate`, { data: { invalid: true } });
  await page.getByRole("link", { name: "Agents" }).click();
  await page.getByRole("link", { name: "Open agent" }).first().click();
  await expect(page.getByRole("heading", { name: "Model and tool spans" })).toBeVisible();
  await expect(page.getByText("tool").first()).toBeVisible();
  await expect(page.getByText("orders.get.tool").first()).toBeVisible();
});

test("keeps route source links available after candidate rejection", async ({ page }) => {
  await page.goto("/agents");
  await page.request.post(`${backend}/__fixture__/candidate`, { data: { invalid: true } });
  await page.getByRole("link", { name: "Routes" }).click();
  await page.getByRole("link", { name: "Open route" }).first().click();
  const source = page.getByRole("link", { name: "src/routes/create-order.route.ts:3:1" });
  await expect(source).toHaveAttribute(
    "href",
    "vscode://file/src/routes/create-order.route.ts:3:1",
  );
});
