/** Exercises the actual route-detail caller and rerenders against the live inspector fixture. */
import { expect, test } from "@playwright/test";
import { playwrightSelection } from "../../scripts/playwright-selection.js";

const { backend } = playwrightSelection("inspector");

for (const streaming of [false, true]) {
  test(`route composer retains observed generation across rerender (${streaming ? "stream" : "POST"})`, async ({
    page,
    request,
  }) => {
    await request.post(`${backend}/__fixture__/reset`);
    if (streaming) {
      await page.route("**/_relkit/v1/routes/orders.create.http", async (route) => {
        const response = await route.fetch();
        const payload = await response.json();
        payload.node.config.stream = { format: "text" };
        await route.fulfill({ response, json: payload });
      });
    }
    await page.goto("/routes/orders.create.http");
    await expect(page.getByRole("heading", { name: "Compose a request" })).toBeVisible();
    const fields = page.locator(".composer-panel input");
    await expect(fields).toHaveCount(4);
    for (const [name, value] of [
      ["orderId", "order-generation"],
      ["customerEmail", "person@example.com"],
      ["sku", "sku-1"],
      ["quantity", "1"],
    ])
      await page.locator(`.composer-panel input[name="${name}"]`).fill(value);
    for (let attempt = 0; attempt < 2; attempt++) {
      const invocation = page.waitForRequest(
        (sent) => sent.url().endsWith("/_relkit/backend/orders") && sent.method() === "POST",
      );
      await page.getByRole("button", { name: "Send request", exact: true }).click();
      expect((await invocation).headers()["x-relkit-generation-id"]).toBe("commerce-generation-1");
      await expect(page.getByRole("heading", { name: "Active backend result" })).toBeVisible();
      await expect(page.getByText("HTTP 201", { exact: true })).toBeVisible();
      if (streaming) await expect(page.getByRole("list", { name: "Stream frames" })).toBeVisible();
      const requestPath = await page
        .getByRole("link", { name: "Open request record" })
        .getAttribute("href");
      await expect(
        page
          .locator('[aria-labelledby="recent-requests-heading"]')
          .locator(`a[href="${requestPath}"]`),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Send request", exact: true })).toBeEnabled();
    }
  });
}
