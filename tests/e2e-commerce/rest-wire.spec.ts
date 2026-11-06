/** The typed client calls the same REST routes the OpenAPI document describes. */
import { expect, test } from "@playwright/test";
import { playwrightSelection } from "../../scripts/playwright-selection.js";

const selected = playwrightSelection("commerce");

test("route calls go to their REST paths and none goes to /rpc", async ({ page }) => {
  const sent: { readonly method: string; readonly path: string }[] = [];
  page.on("request", (call) => {
    const url = new URL(call.url());
    if (url.origin === new URL(selected.backend).origin)
      sent.push({ method: call.method(), path: url.pathname });
  });
  await page.goto("/");
  await expect(page.getByText("Channel: connected; caught up: true")).toBeVisible();
  await page.getByRole("button", { name: "Post announcement" }).click();
  await expect(page.getByRole("status")).toContainText("Posted");
  await page.getByRole("button", { name: "Run report" }).click();
  await expect(page.getByText(/Report: \d/)).toBeVisible();

  // Each call is the route request the OpenAPI document describes, as curl would send it.
  for (const call of [
    { method: "GET", path: "/orders" },
    { method: "GET", path: "/announcements" },
    { method: "POST", path: "/announcements" },
    { method: "GET", path: "/reports/daily" },
  ]) {
    expect(sent).toContainEqual(call);
  }
  expect(sent.filter((call) => call.path === "/rpc" || call.path.startsWith("/rpc/"))).toEqual([]);
});
