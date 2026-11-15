/** Theme, unknown pages and the graph's default fit (IN-41, IN-42, IN-45). */
import { expect, test, type Page } from "@playwright/test";

function consoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("light system", () => {
  test.use({ colorScheme: "light" });

  test("follows the system until a theme is chosen", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "Use dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});

test.describe("dark system", () => {
  test.use({ colorScheme: "dark" });

  test("stays dark without a choice", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Use light theme" })).toBeVisible();
  });
});

test("an unknown page says so inside the shell, without a hydration error", async ({ page }) => {
  const errors = consoleErrors(page);
  const response = await page.goto("/no-such-page");
  await page.waitForTimeout(1_000);
  console.log(`console errors on /no-such-page: ${JSON.stringify(errors)}`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the overview" })).toBeVisible();
  await expect(page.getByRole("navigation").first()).toBeVisible();
  expect(errors.filter((text) => /hydrat|#418|did not match/i.test(text))).toEqual([]);
});

test("graph cards stay readable at the default fit", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/graph");
  const viewport = page.locator(".react-flow__viewport");
  await expect(viewport).toBeVisible();
  await page.waitForTimeout(1_000);
  const scale = await viewport.evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    return transform === "none" ? 1 : new DOMMatrixReadOnly(transform).a;
  });
  console.log(`graph default scale: ${scale}`);
  // The smallest card text is about 11 px at scale 1 (IN-45): a large graph is panned, not shrunk.
  expect(scale).toBeGreaterThanOrEqual(0.99);
});

test.describe("dark graph", () => {
  test.use({ colorScheme: "dark" });

  test("the zoom control takes the dark theme", async ({ page }) => {
    await page.goto("/graph");
    const button = page.locator(".react-flow__controls-button").first();
    await expect(button).toBeVisible();
    const background = await button.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(background).not.toBe("rgb(254, 254, 254)");
    expect(background).not.toBe("rgb(255, 255, 255)");
  });
});
