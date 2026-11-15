/** Overview numbers mean what they say (IN-16, IN-17, IN-18, IN-28). */
import { expect, test, type Page } from "@playwright/test";
import { playwrightSelection } from "../../scripts/playwright-selection.js";

const { backend } = playwrightSelection("inspector");

test.beforeEach(async ({ request }) => {
  await request.post(`${backend}/__fixture__/reset`);
  await request.post(`${backend}/__fixture__/application`, { data: { state: "connected" } });
});

test.afterEach(async ({ request }) => {
  await request.post(`${backend}/__fixture__/application`, { data: { state: "connected" } });
});

async function total(page: Page, query: string): Promise<number> {
  const response = await page.request.get(
    `/_relkit/backend/_relkit/v1/requests?limit=1&count=true${query}`,
  );
  return ((await response.json()) as { total: number }).total;
}

test("request tiles count every retained request, not the newest 100", async ({ page }) => {
  await page.request.post(`${backend}/__fixture__/history`);
  const all = await total(page, "");
  const failed = await total(page, "&status=5xx");
  expect(all).toBeGreaterThan(100);
  await page.goto("/");
  const requests = page.getByRole("link", { name: /^Requests/ }).filter({ hasText: "retained" });
  await expect(requests).toContainText(all.toLocaleString("en-US"));
  await expect(requests).toContainText("trend of the last 100");
  await expect(page.getByRole("link", { name: /^Error rate/ })).toContainText(
    `${failed} of ${all.toLocaleString("en-US")} retained answered 5xx`,
  );
});

test("records lost before history are named; missed live updates are a note", async ({ page }) => {
  await page.request.post(`${backend}/__fixture__/application`, {
    data: {
      state: "connected",
      recordsLostBeforeHistory: { byApplicationProducer: 42, byInspectionBuffer: 3 },
      missedLiveUpdates: 2229,
    },
  });
  await page.goto("/");
  const health = page.locator("#overview-health");
  await expect(health.getByTestId("records-lost")).toContainText("45");
  await expect(health).toContainText("42 by the application");
  await expect(health).toContainText(
    "Some requests, logs or spans from this session are missing from history",
  );
  await expect(health.getByTestId("missed-live-updates")).toHaveText(
    "Live updates were missed; the page refreshed. No record is lost.",
  );
  await expect(page.getByText(/dropped events?/i)).toHaveCount(0);
  await expect(page.getByText("2,229")).toHaveCount(0);
});

test("no export counters without an exporter", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("No external exporter configured.")).toBeVisible();
  await expect(page.getByText("Exporter calls that failed")).toHaveCount(0);
  await expect(page.getByText("Export failures")).toHaveCount(0);
});

test("generation history names starts, reloads and failures by session", async ({ page }) => {
  await page.route("**/_relkit/v1/logs?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("search") !== "dev.generation.")
      return route.continue();
    const at = (minute: number) => `2026-01-01T00:0${minute}:00.000Z`;
    const entry = (cursor: number, message: string, fields: Record<string, unknown>) => ({
      origin: "relkit",
      component: "cli.dev",
      cursor: String(cursor),
      timestamp: at(cursor),
      message,
      fields,
    });
    await route.fulfill({
      json: {
        protocol: "relkit.observability.query",
        version: 1,
        items: [
          entry(5, "dev.generation.swapped", { changedFiles: 2, runId: "run-2", reason: "reload" }),
          entry(4, "dev.generation.failed", {
            message: "Candidate validation failed.",
            cause: "src/orders.ts(3,1): error TS1005",
            runId: "run-2",
            reason: "reload",
          }),
          entry(3, "dev.generation.active", { version: 0, runId: "run-2", reason: "start" }),
          entry(2, "dev.generation.active", { version: 0, runId: "run-1", reason: "start" }),
        ],
      },
    });
  });
  await page.goto("/");
  const history = page.locator("#overview-generations");
  await expect(history).toContainText("Reloaded (2 files changed)");
  await expect(history).toContainText("Reload failed: Candidate validation failed.");
  await expect(history).toContainText("src/orders.ts(3,1): error TS1005");
  await expect(history.getByText("Development session started", { exact: true })).toHaveCount(2);
  // The connected session has no retained record, so neither older run is called current.
  await expect(history.getByRole("heading", { level: 3 })).toHaveCount(3);
  await expect(
    history.getByRole("heading", { name: "Current development session, start not retained" }),
  ).toBeVisible();
  await expect(history.getByText("current", { exact: true })).toHaveCount(0);
  await expect(history).not.toContainText("Generation activated");
  // The reload after the failure succeeded, so no failure banner remains.
  await expect(page.getByRole("region", { name: "Development reload status" })).toHaveCount(0);
});
