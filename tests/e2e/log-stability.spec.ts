import { expect, test } from "@playwright/test";

const backend = "http://127.0.0.1:3212";
test.beforeEach(async ({ request }) => {
  await request.post(`${backend}/__fixture__/reset`);
  await request.post(`${backend}/__fixture__/logs`);
});

test("coalesces bursts and only announces matching new logs while inspection is paused", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/logs?log=164");
  const banner = page.getByRole("button", { name: "New logs available" });
  const rows = page.locator(".log-table tbody tr");
  await expect(rows).toHaveCount(50);
  await expect(page.getByRole("link", { name: "Open full trace" })).toBeVisible();
  const bounds = await page.locator(".log-scroll").boundingBox();
  let queries = 0;
  page.on("request", (value) => {
    if (/\/_relkit\/v1\/logs\?/.test(value.url())) queries++;
  });
  for (let i = 0; i < 8; i++) await request.post(`${backend}/__fixture__/candidate`, { data: {} });
  await page.waitForTimeout(1100);
  await expect(banner).toHaveCount(0);
  expect(queries).toBeLessThanOrEqual(1);
  queries = 0;
  for (let i = 0; i < 12; i++) await request.post(`${backend}/orders`, { data: {} });
  await expect(banner).toBeVisible();
  await page.waitForTimeout(1100);
  expect(queries).toBeLessThanOrEqual(3);
  expect(await page.locator(".log-scroll").boundingBox()).toEqual(bounds);
  await expect(page).toHaveURL(/log=164/);
  await expect(rows.first().getByRole("button")).toHaveAttribute("data-log-cursor", "164");
  await banner.click();
  await expect(rows.first().getByRole("button")).toHaveText("Order request completed.");
  await expect(banner).toHaveCount(0);
  await page.goto("/logs?search=alice&log=164");
  await expect(rows).toHaveCount(50);
  await request.post(`${backend}/orders`, { data: {} });
  await page.waitForTimeout(1100);
  await expect(banner).toHaveCount(0);
});

for (const width of [1600, 1024, 390])
  for (const theme of ["dark", "light"]) {
    test(`request lifecycle workspace at ${width}px in ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.addInitScript(
        (value) => localStorage.setItem("relkit.inspector.theme", value),
        theme,
      );
      await page.goto("/traces?trace=trace-initial");
      await expect(page.getByRole("link", { name: "Open full trace" })).toBeVisible();
      await expect(page.locator('.waterfall-row[data-record-type="request"]')).toHaveCount(1);
      await expect(page.locator('.waterfall-row[data-record-type="span"]')).toHaveCount(2);
      await page.getByRole("button", { name: "Collapse POST /orders", exact: true }).click();
      await expect(page.locator(".waterfall-row")).toHaveCount(1);
      await page.getByRole("button", { name: "Expand POST /orders", exact: true }).click();
      await expect(page.locator(".waterfall-row")).toHaveCount(7);
      await page.screenshot({ path: info.outputPath(`traces-${theme}-${width}.png`) });
      if (width < 1200)
        await expect(page.getByRole("dialog", { name: "Trace details" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page).not.toHaveURL(/trace=/);
      await page.locator('[data-trace-id="trace-initial"]').focus();
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/trace=trace-initial/);
    });
  }
