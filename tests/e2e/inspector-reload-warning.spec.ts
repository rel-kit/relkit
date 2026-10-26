/** Exercises compact reload diagnostics against the inspector UI without editing an application. */
import { expect, test, type Page } from "@playwright/test";

/** Supplies reload logs while the fixture continues serving its unchanged active graph. */
async function reloadLogs(page: Page, state: { value: string }) {
  await page.route("**/_relkit/v1/logs?**", async (route) => {
    const search = new URL(route.request().url()).searchParams.get("search");
    if (search !== "dev.generation." && search !== "dev.build.started") return route.continue();
    if (state.value === "unavailable") return route.fulfill({ status: 503, body: "Unavailable" });
    await route.fulfill({
      json: {
        protocol: "relkit.observability.query",
        version: 1,
        items:
          search === "dev.build.started"
            ? []
            : [
                {
                  origin: "relkit",
                  component: "cli.dev",
                  cursor: state.value,
                  message: `dev.generation.${state.value}`,
                  fields: { message: "Candidate validation failed.\n".repeat(60) },
                },
              ],
      },
    });
  });
}

for (const width of [1280, 390]) {
  test(`reload warning preserves the active snapshot at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    if (width === 390)
      await page.addInitScript(() => localStorage.setItem("relkit.inspector.theme", "dark"));
    const state = { value: "failed" };
    await reloadLogs(page, state);
    expect((await page.request.get("/_relkit/backend/_relkit/v1/graph")).ok()).toBe(true);
    await page.goto("/providers");
    const warning = page.getByRole("region", { name: "Development reload status" });
    await expect(warning).toBeVisible();
    await expect(warning).toContainText("Showing the last valid snapshot: commerce-generation-1", {
      timeout: 20_000,
    });
    const details = warning.locator("details");
    await expect(details).not.toHaveAttribute("open");
    await expect(warning.getByRole("link", { name: "View error logs" })).not.toBeVisible();
    expect((await warning.boundingBox())!.height).toBeLessThan(width === 390 ? 120 : 80);
    await page.screenshot({ path: testInfo.outputPath("collapsed.png"), fullPage: true });
    await warning.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(details).toHaveAttribute("open");
    await expect(warning.getByRole("link", { name: "View error logs" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Providers", exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("expanded.png"), fullPage: true });
    await page.keyboard.press("Space");
    await expect(details).not.toHaveAttribute("open");
    state.value = "unavailable";
    await expect(warning).toContainText("Build status unavailable", { timeout: 20_000 });
    await expect(warning).toContainText("commerce-generation-1");
    state.value = "active";
    await expect(warning).not.toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".generation-bar")).toContainText("commerce-generation-1");
  });
}
