/** One event stream per tab, and no history polling on an idle page (IN-43). */
import { expect, test, type Page, type Request } from "@playwright/test";

/** Streams the page opened and has not closed, counted from the browser's own requests. */
function trackStreams(page: Page) {
  const open = new Set<Request>();
  let opened = 0;
  page.on("request", (request) => {
    if (!request.url().includes("/_relkit/v1/stream")) return;
    opened += 1;
    open.add(request);
  });
  const close = (request: Request) => open.delete(request);
  page.on("requestfinished", close);
  page.on("requestfailed", close);
  return { open: () => open.size, opened: () => opened };
}

for (const path of ["/", "/requests", "/logs", "/graph"]) {
  test(`${path} keeps one event stream open`, async ({ page }) => {
    const streams = trackStreams(page);
    await page.goto(path);
    await expect(page.locator("#main-content")).toBeVisible();
    await page.waitForTimeout(3_000);
    console.log(`streams ${path}: open ${streams.open()}, opened ${streams.opened()}`);
    expect(streams.open()).toBe(1);
  });
}

test("an idle overview reads history only on load", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(page.locator("#main-content")).toBeVisible();
  await page.waitForTimeout(3_000);
  const history: string[] = [];
  const status: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (/\/_relkit\/v1\/(logs|requests|traces)(\/|$)/.test(url.pathname))
      history.push(`${url.pathname}${url.search}`);
    if (url.pathname.endsWith("/_relkit/v1/storage")) status.push(url.pathname);
  });
  await page.waitForTimeout(30_000);
  console.log(`idle overview, 30 s: ${history.length} history, ${status.length} status requests`);
  for (const entry of history) console.log(`  ${entry}`);
  expect(history.length).toBeLessThanOrEqual(2);
});

test("three tabs each keep their stream connected", async ({ context }) => {
  const pages = await Promise.all([context.newPage(), context.newPage(), context.newPage()]);
  await Promise.all(pages.map((page, index) => page.goto(["/", "/requests", "/logs"][index]!)));
  for (const page of pages)
    await expect(page.getByTestId("inspector-stream-state")).toHaveAttribute(
      "data-state",
      "connected",
      { timeout: 20_000 },
    );
});
