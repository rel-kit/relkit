import { expect, test } from "@playwright/test";

const initialTraceId = "11111111111111111111111111111111";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:3212/__fixture__/reset");
  await request.post("http://127.0.0.1:3212/__fixture__/logs");
});

test("keeps selected rows stable, navigates with keys, searches, and resumes live updates", async ({
  page,
  request,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/logs");
  const rows = page.locator(".log-table tbody tr");
  await expect(rows).toHaveCount(50);
  await page.locator("[data-log-cursor='164']").click();
  await expect(page).toHaveURL(/log=164/);
  await expect(page.getByRole("complementary", { name: "Log details" })).toBeVisible();
  await expect(page.locator("[data-highlighted='true']")).toHaveCount(1);
  await page.getByRole("button", { name: "Copy traceId" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(initialTraceId);
  await page.locator("[data-log-cursor='164']").focus();
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/log=163/);
  await request.post("http://127.0.0.1:3212/orders", { data: {} });
  await expect(page.getByRole("button", { name: "New logs available" })).toBeVisible();
  await expect(rows).toHaveCount(50);
  await expect(page).toHaveURL(/log=163/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Log details" })).toHaveCount(0);
  await page.getByLabel("Search logs").fill("alice");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/search=alice/);
  await expect(rows).toHaveCount(50);
  await page.getByRole("button", { name: "Older", exact: true }).click();
  await expect(rows).toHaveCount(15);
  await page.getByRole("button", { name: "Newest", exact: true }).click();
  await expect(rows).toHaveCount(50);
  await page.getByLabel("Search logs").fill("unmatched-search");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No retained logs match these filters.")).toBeVisible();
});

for (const width of [1600, 1024, 390])
  for (const theme of ["light", "dark"]) {
    test(`selected log and trace at ${width}px in ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (value) => localStorage.setItem("relkit.inspector.theme", value),
        theme,
      );
      await page.goto("/logs?log=163");
      await expect(page.getByRole("link", { name: "Open full trace" })).toBeVisible();
      await expect(page.locator("[data-highlighted='true']")).toHaveCount(1);
      if (width < 1200)
        await expect(page.getByRole("dialog", { name: "Log details" })).toBeVisible();
      if (process.platform === "darwin" && width === 1600 && theme === "light")
        await expect(page.locator(".logs-workspace")).toHaveScreenshot("logs-workspace.png", {
          animations: "disabled",
        });
      await page.screenshot({ path: info.outputPath(`logs-${theme}-${width}.png`) });
      await page.locator("[data-highlighted='true']").scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`logs-trace-${theme}-${width}.png`) });
      await page.getByRole("button", { name: "Close log details" }).click();
      await expect(page).not.toHaveURL(/log=/);
    });
  }

test("reports expired logs and unavailable traces without inventing relationships", async ({
  page,
}) => {
  await page.goto("/logs?log=999999");
  await expect(
    page.getByText("This log is no longer retained. It may have expired."),
  ).toBeVisible();
  await page.route(new RegExp(`/_relkit/v1/traces/${initialTraceId}`), (route) =>
    route.fulfill({
      status: 404,
      json: { protocol: "relkit.inspector", version: 1, error: "RELKIT_OBSERVABILITY_NOT_FOUND" },
      headers: { "x-relkit-api-version": "1" },
    }),
  );
  await page.goto("/logs?log=163");
  await expect(
    page.getByText("Trace unavailable. It may not have been captured or may have expired."),
  ).toBeVisible();
});

test("loads additional trace pages in the log pane and full trace view", async ({
  page,
  request,
}) => {
  const detail = await (
    await request.get(`http://127.0.0.1:3212/_relkit/v1/traces/${initialTraceId}`)
  ).json();
  const first = detail.spans.slice(0, 1);
  const rest = detail.spans.slice(1);
  await page.route(new RegExp(`/_relkit/v1/traces/${initialTraceId}`), (route) =>
    route.fulfill({
      json: { ...detail, spans: first, records: first, nextCursor: "1" },
      headers: { "x-relkit-api-version": "1" },
    }),
  );
  await page.route(/\/_relkit\/v1\/traces\?/, (route) =>
    route.fulfill({
      json: { protocol: "relkit.observability.query", version: 1, items: rest },
      headers: { "x-relkit-api-version": "1" },
    }),
  );
  for (const path of ["/logs?log=164", `/traces/${initialTraceId}`]) {
    await page.goto(path);
    await expect(
      page.getByText("Partial trace: more records are retained.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Load more trace records" }).click();
    await expect(page.locator('.waterfall-row[data-record-type="span"]')).toHaveCount(
      detail.spans.length,
    );
    await expect(page.locator('.waterfall-row[data-record-type="event"]')).toHaveCount(6);
    await expect(page.getByRole("button", { name: "Load more trace records" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Inspect span", exact: true })).toHaveCount(0);
  }
});
