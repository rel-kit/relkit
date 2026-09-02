import { expect, test } from "@playwright/test";

const backend = "http://127.0.0.1:3212";

test.beforeEach(async ({ page, request }) => {
  await request.post(`${backend}/__fixture__/reset`);
  await page.setViewportSize({ width: 1280, height: 900 });
});

test("centers select labels before and after changing selection", async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [path, label, initial, selected] of [
      ["/jobs", "Status", "All", "available"],
      ["/routes", "Kind", "All", "POST"],
      ["/traces/trace-initial", "Timeline zoom", "100%", "150%"],
    ] as const) {
      await page.goto(path);
      const trigger = page.getByRole("button", { name: new RegExp(label) });
      for (const value of [initial, selected]) {
        if (value === selected) {
          await trigger.click();
          await page.getByRole("option", { name: value, exact: true }).click();
        }
        const text = trigger.getByText(value, { exact: true });
        await expect(text).toBeVisible();
        const textBox = await text.boundingBox();
        const triggerBox = await trigger.boundingBox();
        expect(textBox).not.toBeNull();
        expect(triggerBox).not.toBeNull();
        expect(
          Math.abs(textBox!.y + textBox!.height / 2 - triggerBox!.y - triggerBox!.height / 2),
        ).toBeLessThanOrEqual(1);
        await expect(trigger.locator("svg")).toHaveCount(1);
      }
    }
  }
});

test("supports keyboard search and accessible route table quick views", async ({ page }) => {
  await page.goto("/routes");
  await expect(page.getByRole("heading", { name: "Routes" })).toBeVisible();
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.keyboard.press("ControlOrMeta+K");
  const search = page.getByRole("dialog", { name: "Search inspector" });
  await expect(search).toBeVisible();
  await search.getByRole("combobox", { name: "Destination" }).fill("Graph");
  await expect(page.getByRole("option", { name: /Graph Workspace/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await search.getByRole("button", { name: "Close dialog" }).click();

  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader", { name: "Transport" })).toBeVisible();
  await expect(page).toHaveScreenshot("routes-table-light.png", {
    animations: "disabled",
    fullPage: true,
  });

  await table.getByRole("button", { name: "Quick view" }).first().click();
  const details = page.getByRole("dialog");
  await expect(details).toContainText("orders.create.http");
  await expect(details).toHaveScreenshot("route-quick-view.png", { animations: "disabled" });
});

test("renders the interactive graph, trace waterfall, and Scalar reference", async ({ page }) => {
  await page.goto("/graph");
  const graph = page.getByRole("region", { name: "Interactive capability graph" });
  await expect(graph).toBeVisible();
  await expect(graph.getByRole("button", { name: /zoom in/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Relationship table" })).toBeVisible();
  await expect(page.locator(".graph-panel")).toHaveScreenshot("graph-canvas.png", {
    animations: "disabled",
  });

  await page.goto("/traces/trace-initial");
  const waterfall = page.getByRole("list", { name: "Accessible span waterfall" });
  await expect(waterfall).toBeVisible();
  await page.getByRole("button", { name: "Collapse all" }).click();
  await expect(page.getByText("1 of 2 spans")).toBeVisible();
  await page.getByRole("button", { name: "Expand all" }).click();
  await page.mouse.move(0, 0);
  await expect(page.locator(".trace-panel")).toHaveScreenshot("trace-waterfall.png", {
    animations: "disabled",
  });

  await page.goto("/api-reference");
  await expect(page.getByRole("heading", { name: "API Reference" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Scalar API Reference" })).toHaveAttribute(
    "href",
    "/_relkit/backend/_relkit/v1/api-reference",
  );
  await expect(page.getByRole("link", { name: "Open Scalar API Reference" })).toHaveAttribute(
    "rel",
    "noreferrer",
  );
  await expect(page.locator(".api-reference-page")).toHaveScreenshot("api-reference.png", {
    animations: "disabled",
  });
});

test("keeps the shell usable in dark mode and on mobile", async ({ page }) => {
  await page.goto("/routes");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".shell-workspace")).toHaveScreenshot("shell-dark.png", {
    animations: "disabled",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(page.locator('[data-mobile="true"]')).toBeVisible();
  const routes = page.getByRole("link", { name: "Routes" });
  await routes.focus();
  await expect(routes).toBeFocused();
  await expect(page).toHaveScreenshot("shell-mobile.png", {
    animations: "disabled",
    fullPage: true,
  });
});
