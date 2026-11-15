/** Preserves live request, pause/resume and correlated failure assertions on this invocation's exact backend. */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { playwrightSelection } from "../../scripts/playwright-selection.js";
import { FAILURE_FIXTURE_IDS } from "../inspector/fixture-failures";
const { backend } = playwrightSelection("inspector");
test.beforeAll(async ({ request }) => {
  // Compile this flow's cold routes outside the separate interaction deadline.
  test.setTimeout(120_000);
  for (const path of [
    "/_relkit/backend/_relkit/v1/health/ready",
    "/requests",
    "/requests/request-initial-0001",
    "/functions",
    "/functions/orders.create",
    "/logs",
    "/traces",
    "/traces/00000000000000000000000000000001",
  ]) {
    // `next dev` under the suite's heap cap can restart mid-compile and reset the socket;
    // one retry lets the restarted server finish compiling the page.
    const response = await request.get(path).catch(() => request.get(path));
    expect(response.status()).toBe(200);
  }
});
test.beforeEach(async ({ request }) => {
  await request.post(`${backend}/__fixture__/reset`);
});
test("shows a new request live and renders its correlated timeline and edges", async ({
  page,
  request,
}) => {
  await page.goto("/requests");
  await expect(page.getByRole("heading", { name: "Requests" })).toBeVisible();
  await expect(page.getByText("Live: connected", { exact: true })).toBeVisible();
  await request.post(`${backend}/orders`, {
    data: { sku: "sku-live", quantity: 1 },
    headers: { "idempotency-key": "order-live", "x-customer-email": "buyer@example.com" },
  });
  await expect(page.getByText("request-live-0002")).toBeVisible();

  await page.getByRole("link", { name: "Open request" }).first().click();
  await expect(page.getByRole("heading", { name: "Request detail" })).toBeVisible();
  await expect(page.getByText("orders.create").first()).toBeVisible();
  await expect(page.getByText("prices.getOrSet").first()).toBeVisible();

  await page.getByRole("link", { name: "Functions", exact: true }).click();
  await page.getByRole("link", { name: "Open function" }).first().click();
  await expect(page.getByRole("heading", { name: "Declared edges" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Observed recent edges" })).toBeVisible();
  await expect(page.getByText("cache.get")).toBeVisible();

  await page.getByRole("link", { name: "Logs" }).click();
  await expect(page.getByRole("heading", { name: "Logs" })).toBeVisible();
  await expect(page.getByText("Order request completed.")).toBeVisible();
  await page.getByRole("button", { name: "Order request completed." }).click();
  await expect(page.getByRole("link", { name: "Open full trace" })).toBeVisible();
  await page.getByRole("button", { name: "Close log details" }).click();

  await page.getByRole("link", { name: "Traces" }).click();
  await expect(page.getByRole("heading", { name: "Traces" })).toBeVisible();
  await page.locator('[data-trace-id="00000000000000000000000000000002"]').click();
  await expect(page.getByRole("link", { name: "Open full trace" })).toBeVisible();
  await page.getByRole("link", { name: "Open full trace" }).click();
  await expect(page.getByRole("heading", { name: "Trace detail" })).toBeVisible();
});

test("follows a paused request through completion and linked work", async ({ page, request }) => {
  await page.goto("/requests");
  const pending = request.post(`${backend}/__fixture__/paused`);
  await expect(page.getByText("request-paused-0001")).toBeVisible();
  await page.getByRole("link", { name: "Open request" }).first().click();

  await expect(page.getByRole("heading", { name: "Request detail" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Request timeline" })).toBeVisible();
  await expect(page.getByText("In progress").first()).toBeVisible();
  await page.getByRole("button", { name: "Inspect HTTP POST /orders" }).click();
  // The selected step's details stay open beside the waterfall: attributes and events inline.
  const stepDetails = page.getByRole("complementary", { name: "Step details" });
  await expect(stepDetails.getByRole("heading", { name: "HTTP POST /orders" })).toBeVisible();
  await expect(stepDetails.getByText(/relkit\.request\.id/)).toBeVisible();
  await expect(stepDetails.getByText(/http\.request\.received/)).toBeVisible();

  await request.post(`${backend}/__fixture__/release`);
  await pending;
  const timeline = page.getByRole("list", { name: "Ordered trace timeline" });
  await expect(timeline.getByText("http.response.completed", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Continuations" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open trace" })).toBeVisible();

  await page.reload();
  await expect(page.getByText("request-paused-0001").first()).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Ordered trace timeline" })
      .getByText("http.request.received", { exact: false }),
  ).toHaveCount(1);
  await page.getByRole("link", { name: /222222222222/ }).click();
  await expect(page.getByRole("heading", { name: "Trace detail" })).toBeVisible();
});

interface HistorySeed {
  readonly seeded: number;
  readonly serverErrors: number;
  readonly declared: number;
  readonly posts: number;
  readonly total: number;
}
const seedHistory = async (request: APIRequestContext): Promise<HistorySeed> =>
  (await request.post(`${backend}/__fixture__/history`)).json();
const rows = (page: Page) =>
  page.getByRole("list", { name: "Request results" }).getByRole("listitem");

test("lists the newest requests first and pages back to the oldest", async ({ page, request }) => {
  const seed = await seedHistory(request);
  const ordered = page.waitForRequest(
    (sent) => sent.url().includes("/requests?") && sent.url().includes("order=desc"),
  );
  await page.goto("/requests");
  await ordered;
  await expect(page.getByText("Newest first · 50 per page")).toBeVisible();
  await expect(page.getByText(`${seed.total} requests`, { exact: true })).toBeVisible();
  await expect(rows(page)).toHaveCount(50);
  await expect(rows(page).first()).toContainText("request-history-130");
  await expect(rows(page).last()).toContainText("request-history-081");

  await page.getByRole("button", { name: "Older requests" }).click();
  await expect(page).toHaveURL(/cursor=50/);
  await expect(rows(page).first()).toContainText("request-history-080");
  await page.getByRole("button", { name: "Older requests" }).click();
  await expect(rows(page)).toHaveCount(seed.total - 100);
  await expect(rows(page).last()).toContainText("request-initial");
  await expect(page.getByRole("button", { name: "Older requests" })).toBeDisabled();

  await page.getByRole("button", { name: "Newer requests" }).click();
  await expect(rows(page).first()).toContainText("request-history-080");
  await page.goBack();
  await expect(rows(page).first()).toContainText("request-history-030");
});

test("filters by status, method, path and text, keeps them in the URL, and counts the matches", async ({
  page,
  request,
}) => {
  const seed = await seedHistory(request);
  await page.goto("/requests");
  await expect(page.getByText(`${seed.total} requests`, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "5xx" }).click();
  await expect(page).toHaveURL(/status=5xx/);
  await expect(page.getByText(`${seed.serverErrors} requests match`)).toBeVisible();
  await expect(rows(page)).toHaveCount(seed.serverErrors);

  await page.reload();
  await expect(page.getByRole("button", { name: "5xx" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(`${seed.serverErrors} requests match`)).toBeVisible();
  await expect(rows(page)).toHaveCount(seed.serverErrors);

  await page.getByLabel("Status", { exact: true }).fill("409");
  await page.getByLabel("Path starts with").fill("/vehicles");
  await page.getByLabel("Method").selectOption("POST");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/status=409/);
  await expect(page).toHaveURL(/path=%2Fvehicles/);
  await expect(page.getByText(`${seed.declared} requests match`)).toBeVisible();
  await expect(rows(page).first()).toContainText("/vehicles");

  await page.getByLabel("Search", { exact: true }).fill("no-such-text");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("No requests match")).toBeVisible();
  await expect(page.getByText("No retained requests match the active filters.")).toBeVisible();

  await page.goBack();
  await expect(page.getByText(`${seed.declared} requests match`)).toBeVisible();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page).toHaveURL(/\/requests$/);
  await expect(page.getByText(`${seed.total} requests`, { exact: true })).toBeVisible();
});

test("offers the recorded outcomes and shows a rejected filter at its field", async ({
  page,
  request,
}) => {
  await seedHistory(request);
  await page.goto("/requests");
  const outcome = page.getByLabel("Outcome");
  await expect(outcome.getByRole("option")).toHaveText([
    "All outcomes",
    "Success",
    "Declared error",
    "Validation error",
    "Timeout",
    "Cancelled",
    "Unexpected failure",
  ]);
  await outcome.selectOption("validation-error");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/outcome=validation-error/);

  await page.goto("/requests");
  await page.getByLabel("Status", { exact: true }).fill("700");
  await page.getByRole("button", { name: "Apply filters" }).click();
  const message = "Status must be a code from 100 to 599, or a class such as 5xx.";
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByLabel("Status", { exact: true })).toHaveAccessibleDescription(message);
  await expect(page).toHaveURL(/\/requests$/);

  // A link with a value the page would not send: the Inspector rejects it and the page says so.
  await page.goto("/requests?status=abc");
  await expect(page.getByText("These filters were not accepted.")).toBeVisible();
  await expect(page.getByLabel("Status", { exact: true })).toHaveAccessibleDescription(
    /status is invalid/,
  );
});

test("shows the Inspector's own message for a rejected filter at the field it names", async ({
  page,
  request,
}) => {
  await seedHistory(request);
  await page.goto("/requests?status=999");
  const status = page.getByLabel("Status", { exact: true });
  await expect(page.getByText("These filters were not accepted.")).toBeVisible();
  // The server's message names the parameter and the rule, and replaces the page's own sentence.
  await expect(status).toHaveAccessibleDescription(
    "Observability query status is invalid: expected an HTTP status from 100 to 599 or a class from 1xx to 5xx",
  );
  await expect(status).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText(/Status must be a code from 100 to 599/)).toHaveCount(0);

  // Editing the field drops the refused value's message; a valid value loads the list again.
  await status.fill("404");
  await expect(status).not.toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/status=404/);
  await expect(page.getByText("These filters were not accepted.")).toHaveCount(0);
});

test("a declared error names its identifier and links to its contract", async ({
  page,
  request,
}) => {
  await request.post(`${backend}/__fixture__/failures`);
  await page.goto(`/requests/${FAILURE_FIXTURE_IDS.declared}`);
  const panel = page.getByRole("region", { name: "Why this request failed" });
  await expect(panel.getByText("The application ended this request with the error")).toBeVisible();
  await expect(panel.getByRole("link", { name: "fleet.plate-taken" })).toHaveAttribute(
    "href",
    "/errors/fleet.plate-taken",
  );
  const record = page.getByRole("region", { name: "Request record" });
  await expect(record.getByText("Error", { exact: true })).toBeVisible();
  await expect(record.getByRole("link", { name: "fleet.plate-taken" })).toBeVisible();
});

test("a validation failure lists the fields and the kind of problem, never values", async ({
  page,
  request,
}) => {
  await request.post(`${backend}/__fixture__/failures`);
  await page.goto(`/requests/${FAILURE_FIXTURE_IDS.invalid}`);
  const panel = page.getByRole("region", { name: "Why this request failed" });
  await expect(panel.getByRole("columnheader", { name: "Field" })).toBeVisible();
  await expect(panel.getByRole("columnheader", { name: "Problem" })).toBeVisible();
  await expect(panel.getByRole("row", { name: /plate\s+Missing/ })).toBeVisible();
  await expect(panel.getByRole("row", { name: /vehicle\.wheels\.9/ })).toBeVisible();
  await expect(panel.getByRole("row")).toHaveCount(11);
  await expect(panel.getByText("and 2 more")).toBeVisible();
  await expect(panel.getByText(/never the values that were sent/)).toBeVisible();
});

test("an internal failure shows its recorded cause, with the stack collapsed", async ({
  page,
  request,
}) => {
  await request.post(`${backend}/__fixture__/failures`);
  await page.goto(`/requests/${FAILURE_FIXTURE_IDS.defectDev}`);
  const panel = page.getByRole("region", { name: "Why this request failed" });
  await expect(panel.getByText("DatabaseError", { exact: true })).toBeVisible();
  await expect(panel.getByText(/Failed query: insert into vehicles/)).toContainText(
    "params: [REDACTED]",
  );
  await expect(panel.getByText("RELKIT_UNEXPECTED_DEFECT")).toBeVisible();
  await expect(panel.getByText(/at insertVehicle/)).toBeHidden();
  await panel.getByText("Stack trace").click();
  await expect(panel.getByText(/at insertVehicle/)).toBeVisible();
  await expect(panel.getByText("The cause is recorded only in development.")).toBeHidden();
});

test("outside development only the error type is recorded, and the page says so", async ({
  page,
  request,
}) => {
  await request.post(`${backend}/__fixture__/failures`);
  await page.goto(`/requests/${FAILURE_FIXTURE_IDS.defectTypeOnly}`);
  const panel = page.getByRole("region", { name: "Why this request failed" });
  await expect(panel.getByText("UnexpectedDefect", { exact: true })).toBeVisible();
  await expect(panel.getByText("The cause is recorded only in development.")).toBeVisible();

  await request.post(`${backend}/__fixture__/outcome/defect`);
  await page.goto("/requests/request-defect");
  await expect(page.getByText("No cause was recorded for this request.")).toBeVisible();
});

test("the record and the timeline agree on the span count and show times with a zone", async ({
  page,
  request,
}) => {
  await request.post(`${backend}/__fixture__/failures`);
  await page.goto(`/requests/${FAILURE_FIXTURE_IDS.captured}`);
  const record = page.getByRole("region", { name: "Request record" });
  // Three records (the root span, and the function span reported at start and at end) are two spans.
  await expect(record.getByText("Spans", { exact: true })).toBeVisible();
  await expect(record.locator("dt:has-text('Spans') + dd")).toHaveText("2");
  await expect(page.getByText("2 spans", { exact: true })).toBeVisible();

  const started = record.locator("time").first();
  await expect(started).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \S+$/);
  await expect(started).toHaveAttribute(
    "title",
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} UTC$/,
  );
});

test("system routes show their path with the route id beside it, never unknown", async ({
  page,
  request,
}) => {
  await request.post(`${backend}/__fixture__/failures`);
  await page.goto("/requests?path=%2Fapi%2Fauth");
  const row = rows(page).first();
  await expect(row).toContainText("/api/auth/sign-in");
  await expect(row).toContainText("relkit.auth");
  await expect(row).not.toContainText("unknown");
});

test("the command palette takes the cursor on open and opens a pasted request or trace id", async ({
  page,
  request,
}) => {
  await request.post(`${backend}/__fixture__/failures`);
  await page.goto("/requests");
  await expect(page.getByRole("heading", { name: "Requests" })).toBeVisible();

  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog").getByRole("combobox", { name: "Destination" });
  await expect(search).toBeFocused();

  // Typing goes straight into the field, and Enter opens the request.
  await page.keyboard.type(FAILURE_FIXTURE_IDS.declared);
  await expect(
    page.getByRole("dialog").getByText(`Open request ${FAILURE_FIXTURE_IDS.declared}`).first(),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/requests/${FAILURE_FIXTURE_IDS.declared}$`));
  await expect(page.getByRole("heading", { name: "Request detail" })).toBeVisible();

  const traceId = "9".repeat(32);
  await page.keyboard.press("Control+k");
  await expect(search).toBeFocused();
  await page.keyboard.type(traceId);
  await page.getByRole("button", { name: `Open trace ${traceId}` }).click();
  await expect(page).toHaveURL(new RegExp(`/traces/${traceId}$`));
  await expect(page.getByRole("heading", { name: "Trace detail" })).toBeVisible();

  // Text that is not an identifier still searches pages and graph entities.
  await page.keyboard.press("Control+k");
  await expect(search).toBeFocused();
  await page.keyboard.type("Requests");
  await expect(page.locator(".command-result", { hasText: "Requests" }).first()).toBeVisible();
  await expect(page.getByRole("dialog").getByText("Open request")).toHaveCount(0);
});

test("pinpoints failed, timed out, cancelled, and incomplete requests", async ({
  page,
  request,
}) => {
  for (const outcome of ["defect", "timeout", "cancelled"] as const) {
    await request.post(`${backend}/__fixture__/outcome/${outcome}`);
    await page.goto(`/requests/request-${outcome}`);
    await expect(page.getByRole("heading", { name: "Request detail" })).toBeVisible();
    await expect(page.getByText(outcome, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Incomplete telemetry: missing-parent/)).toBeVisible();
    await page.getByRole("button", { name: "Inspect HTTP POST /orders" }).click();
    await expect(
      page.getByRole("complementary", { name: "Step details" }).getByText(/"attributes": 2/),
    ).toBeVisible();
  }
});
