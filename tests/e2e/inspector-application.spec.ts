/** The application's session is shown apart from the Inspector's own stream (IN-09, IN-10, IN-48). */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { playwrightSelection } from "../../scripts/playwright-selection.js";

const { backend } = playwrightSelection("inspector");

async function application(request: APIRequestContext, body: Record<string, unknown>) {
  await request.post(`${backend}/__fixture__/application`, { data: body });
}

function banner(page: Page) {
  return page.getByRole("region", { name: "Application status" });
}

test.beforeEach(async ({ request }) => {
  await request.post(`${backend}/__fixture__/reset`);
  await application(request, { state: "connected" });
});

test.afterEach(async ({ request }) => {
  await application(request, { state: "connected" });
});

test("a stopped session shows on every page within a second or two", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("inspector-application-state")).toHaveAttribute(
    "data-state",
    "connected",
  );
  await expect(banner(page)).toHaveCount(0);
  await application(page.request, { state: "disconnected" });
  await expect(banner(page)).toContainText("The application is not connected", { timeout: 3_000 });
  await expect(banner(page)).toContainText("Retained history is still shown");
  await expect(banner(page)).toContainText("inspector: { enabled: true }");
  await expect(page.getByTestId("inspector-stream-state")).toHaveAttribute(
    "data-state",
    "connected",
  );
  await expect(page.getByTestId("overview-application-state")).toContainText("unreachable");

  await page.goto("/requests");
  await expect(banner(page)).toContainText("The application is not connected");
  await expect(page.getByText("Live: paused")).toBeVisible();

  await page.goto(`/functions/orders.create`);
  await expect(page.getByTestId("needs-application")).toContainText(
    "Unavailable while the application is not connected",
  );
  await page.goto("/env");
  await expect(page.getByTestId("needs-application")).toBeVisible();

  await application(page.request, { state: "connected" });
  await expect(banner(page)).toHaveCount(0, { timeout: 3_000 });
  await expect(page.getByRole("heading", { name: "Environment", exact: true })).toBeVisible();
});

test("with no session since the page opened it waits for one (IN-48)", async ({ page }) => {
  await application(page.request, { state: "disconnected" });
  await page.goto("/");
  await expect(banner(page)).toContainText("Waiting for a development session");
  await expect(banner(page)).toContainText("No running relkit dev session was found");
  await expect(page.getByTestId("inspector-application-state")).toHaveText("app no session");
});

test("several sessions name the flag that picks one", async ({ page }) => {
  await page.goto("/logs");
  await application(page.request, { state: "ambiguous", sessions: ["dev-a", "dev-b"] });
  await expect(banner(page)).toContainText("Several development sessions found", {
    timeout: 3_000,
  });
  await expect(banner(page)).toContainText("--connection-file");
  await expect(banner(page)).toContainText("dev-a");
});

test("the header status holds at 900 px", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/");
  const status = page.getByRole("list", { name: "Inspector status" });
  await expect(status).toBeVisible();
  const box = (await status.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(900);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(900);
});
