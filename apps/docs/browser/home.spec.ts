/** Checks the docs hero's motion controls, authored links and shared monochrome theme. */
import { expect, test } from "@playwright/test";

test("docs hero animates, pauses with the keyboard and respects reduced motion", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/docs");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const hero = page.getByRole("region", { name: "RELKIT documentation", exact: true });
  await expect(hero.getByRole("heading", { level: 1 })).toContainText("TypeScript API.");
  await expect(hero.locator("h1 p, .docs-hero-actions a p")).toHaveCount(0);
  const flow = hero.locator(".docs-hero-flow").first();
  const offset = await flow.evaluate((node) => getComputedStyle(node).strokeDashoffset);
  await expect
    .poll(() => flow.evaluate((node) => getComputedStyle(node).strokeDashoffset))
    .not.toBe(offset);
  const pause = hero.getByRole("checkbox", { name: "Pause hero animation" });
  await pause.focus();
  await pause.press("Space");
  await expect(pause).toBeChecked();
  await expect(flow).toHaveCSS("animation-play-state", "paused");
  await pause.press("Space");
  await expect(flow).toHaveCSS("animation-play-state", "running");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(flow).toHaveCSS("animation-name", "none");
  await expect(pause).not.toBeVisible();
  const markdown = await (await request.get("/docs.md")).text();
  expect(markdown).toContain("Start building");
  expect(markdown).toContain("/docs/learn/create-an-app");
  await hero.getByRole("link", { name: "Start building", exact: true }).click();
  await expect(page).toHaveURL(/\/docs\/learn\/create-an-app$/);
});

test("docs use landing colors for backgrounds, card icons and step markers", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const [colorScheme, foreground, background] of [
    ["light", "rgb(17, 18, 22)", "rgb(250, 250, 250)"],
    ["dark", "rgb(247, 247, 248)", "rgb(13, 14, 16)"],
  ] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto("/docs");
    await expect(page.locator("body")).toHaveCSS("background-color", background);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("color", foreground);
    const card = page.locator('[data-blume-card][href="/docs/modules"]');
    await expect(card.locator("svg").first()).toHaveCSS("color", foreground);
    await page.screenshot({
      path: testInfo.outputPath(`docs-home-${colorScheme}.png`),
      animations: "disabled",
    });
    await page.goto("/guides/cli/create-and-build-an-api");
    await expect(page.locator("[data-blume-step] .bg-accent").first()).toHaveCSS(
      "background-color",
      foreground,
    );
  }
});

test("docs hero and its actions fit a narrow screen in both themes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/docs");
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    await expect(page.getByRole("link", { name: "Start building", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`docs-mobile-${colorScheme}.png`),
      animations: "disabled",
    });
    await page.getByRole("link", { name: "Explore modules", exact: true }).click();
    await expect(page).toHaveURL(/\/docs\/modules$/);
  }
});
