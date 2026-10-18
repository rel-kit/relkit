import { expect, test } from "@playwright/test";

const apiOrigin = new URL(process.env.RELKIT_API_URL ?? "http://127.0.0.1:3000").origin;

test("name form updates via backend while preserving fullstack content and wrapper", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Existing workspace" })).toBeVisible();
  await expect(page.getByText("Existing fullstack wrapper")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Existing information" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hello, Relkit!", exact: true })).toBeVisible();
  const name = page.getByLabel("Name", { exact: true });
  const submit = page.getByRole("button", { name: "Update greeting" });
  await name.fill("Ada");
  const backendResponse = page.waitForResponse(async (response) => {
    if (new URL(response.url()).origin !== apiOrigin || !response.ok()) return false;
    return (await response.text()).includes("Hello, Ada!");
  });
  await name.press("Enter");
  await backendResponse;
  await expect(page.getByRole("heading", { name: "Hello, Ada!", exact: true })).toBeVisible();
  await name.fill("   ");
  await expect(submit).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Hello, Ada!", exact: true })).toBeVisible();
  await name.fill("Grace");
  await page.route(apiOrigin + "/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Test-owned unavailable backend" }) }));
  await submit.click();
  await expect(page.getByRole("region", { name: "Greeting", exact: true }).getByRole("alert")).toHaveText("Greeting could not load. Try updating it again.");
  await page.unroute(apiOrigin + "/**");
  await submit.click();
  await expect(page.getByRole("heading", { name: "Hello, Grace!", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(name).toBeVisible();
  await expect(submit).toBeVisible();
  await expect(page.getByText("This page belongs to the selected fullstack application.")).toBeVisible();
});
