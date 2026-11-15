/**
 * Inspector pages for actions and resources: refused actions say why, payloads are checked before
 * they are sent, lists state their totals, empty pages say why they are empty, and the resource
 * pages show what the provider reports. Responses the fixture cannot produce (a protected
 * function, a refused channel, a long event history, system routes of other applications) are
 * supplied by intercepting the Inspector API at the browser.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { playwrightSelection } from "../../scripts/playwright-selection.js";

const { backend } = playwrightSelection("inspector");
const envelope = { protocol: "relkit.inspector", version: 1 };

test.beforeEach(async ({ request }) => {
  await request.post(`${backend}/__fixture__/reset`);
});

/** Replaces a JSON response of the fixture with a changed copy. */
async function patch(
  page: Page,
  url: string | RegExp,
  change: (payload: Record<string, any>, route: Route) => void,
): Promise<void> {
  await page.route(url, async (route) => {
    // A refresh still in flight when the page goes away has nothing left to answer.
    const response = await route.fetch().catch(() => undefined);
    const payload = await response?.json().catch(() => undefined);
    if (response === undefined || payload === undefined) return;
    change(payload, route);
    await route.fulfill({ response, json: payload }).catch(() => undefined);
  });
}

const rejected = (cause?: Record<string, unknown>) => ({
  ...envelope,
  generationId: "commerce-generation-1",
  graphHash: "sha256:commerce-inspector-fixture-v1",
  action: "function.invoke",
  error: "RELKIT_INSPECTOR_ACTION_FAILED",
  ...(cause === undefined ? {} : { cause }),
});

test("a refused invocation shows the application's answer and says no session is attached", async ({
  page,
}) => {
  await patch(page, "**/_relkit/v1/functions/orders.get", (payload) => {
    const node = payload.node;
    node.access = { roles: ["admin"] };
    node.input = {
      $relkit: "schema",
      jsonSchema: {
        type: "object",
        properties: { orderId: { type: "string" }, limit: { type: "integer", default: 10 } },
        required: ["orderId", "limit"],
      },
      inputJsonSchema: {
        type: "object",
        properties: { orderId: { type: "string" }, limit: { type: "integer", default: 10 } },
        required: ["orderId"],
      },
    };
    payload.observedEdges = [
      {
        relationship: "calls-function",
        from: "orders.get",
        to: "orders.create",
        count: 12,
        firstSeenAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:05:00.000Z",
      },
    ];
  });
  let cause: Record<string, unknown> = { status: 401, code: "unauthenticated" };
  await page.route("**/_relkit/v1/actions/functions/orders.get/invoke", (route) =>
    route.fulfill({ status: 409, json: rejected(cause) }),
  );
  await page.goto("/functions/orders.get");
  await expect(page.getByText("This function has an access rule.")).toBeVisible();
  // The field with a default is optional, as the route form already says.
  await expect(page.getByText("(integer) · optional · default 10")).toBeVisible();
  await expect(page.getByText("(string) · required")).toBeVisible();
  await expect(page.getByText("seen 12 times")).toBeVisible();

  await page.getByLabel(/orderId/).fill("order-100");
  const invoke = page.getByRole("button", { name: "Invoke locally" });
  const answer = page.locator("#function-invocation-answer");
  await invoke.click();
  await expect(answer).toContainText("The application refused this call (401)");
  await expect(answer).toContainText("no user session is attached");
  await expect(answer).toContainText("can only be invoked through the application");

  cause = { status: 403, code: "access-denied" };
  await invoke.click();
  await expect(answer).toContainText("The application refused this call (403)");

  cause = {
    status: 422,
    code: "validation",
    issues: [{ path: ["vehicle", "plate"], code: "invalid_type" }],
  };
  await invoke.click();
  await expect(answer).toContainText("does not satisfy the function's input schema (422)");
  await expect(answer.getByRole("row", { name: /vehicle\.plate/ })).toContainText("Wrong type");

  cause = { status: 409, code: "orders.out-of-stock" };
  await invoke.click();
  await expect(answer).toContainText("ended this call with its declared error (409)");
  await expect(answer.getByRole("link", { name: "orders.out-of-stock" })).toHaveAttribute(
    "href",
    "/errors/orders.out-of-stock",
  );
});

test("the route composer's status line follows the response", async ({ page }) => {
  await page.goto("/routes/orders.create.http");
  await page.getByLabel(/orderId \(header\)/).fill("order-100");
  await page.getByLabel(/customerEmail \(header\)/).fill("buyer@example.com");
  await page.getByLabel(/sku \(body\)/).fill("sku-1");
  await page.getByLabel(/quantity \(body\)/).fill("2");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator("#route-outcome")).toHaveText("Request completed (201).");

  await page.route("**/_relkit/backend/orders", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/problem+json",
      body: JSON.stringify({ status: 401, code: "unauthenticated", detail: "Sign in" }),
    }),
  );
  await page.getByRole("button", { name: "Send request" }).click();
  const outcome = page.locator("#route-outcome");
  await expect(outcome).toContainText("The application refused this request (401)");
  await expect(outcome).toContainText("no user session is attached");
  await expect(page.locator("#route-session-note")).toHaveText(
    "This request was sent without a user session.",
  );

  await page.unroute("**/_relkit/backend/orders");
  await page.route("**/_relkit/backend/orders", (route) =>
    route.fulfill({
      status: 409,
      contentType: "application/problem+json",
      body: JSON.stringify({ status: 409, code: "orders.out-of-stock" }),
    }),
  );
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(outcome).toHaveText(
    "The application answered 409 with the problem code orders.out-of-stock.",
  );
});

test("a channel's params start from its declared parameters and a refused connection is explained", async ({
  page,
}) => {
  await page.route("**/_relkit/v1/channels/orders.live", (route) =>
    route.fulfill({
      json: {
        ...envelope,
        generationId: "commerce-generation-1",
        graphHash: "sha256:commerce-inspector-fixture-v1",
        node: {
          kind: "channel",
          id: "orders.live",
          client: "protected",
          presence: "count",
          replay: { retentionMs: 60_000 },
          params: {
            type: "object",
            properties: { companyId: { type: "string" } },
            required: ["companyId"],
          },
          events: { updated: { type: "object" } },
        },
      },
    }),
  );
  await page.route("**/_relkit/v1/rpc/relkit.realtime.subscribe", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        json: {
          defined: false,
          code: "NOT_FOUND",
          status: 404,
          message: "Channel resource was not found.",
        },
        meta: [],
      }),
    }),
  );
  await page.goto("/channels/orders.live");
  await expect(page.getByLabel("Partition params (JSON)")).toHaveValue('{\n  "companyId": ""\n}');
  await expect(page.getByText("60,000 ms retention")).toBeVisible();
  await page.getByRole("button", { name: "Connect fresh" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "refused or concealed" });
  await expect(alert).toContainText("this browser's session for the application's origin");
});

/** Makes `orders.created` require an order id. */
const requireOrderId = (page: Page) =>
  patch(page, "**/_relkit/v1/graph", ({ nodes }) => {
    const event = (nodes as Record<string, any>[]).find((node) => node.id === "orders.created");
    event!.input = {
      type: "object",
      properties: { orderId: { type: "string" } },
      required: ["orderId"],
    };
  });

test("event publish checks the payload, asks first and answers beside the control", async ({
  page,
}) => {
  await requireOrderId(page);
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/_relkit/v1/actions/events/"))
      sent.push(request.url());
  });
  await page.goto("/events/orders.created");
  const payload = page.getByLabel("Event payload (JSON)");
  await expect(payload).toHaveValue('{\n  "orderId": ""\n}');

  await payload.fill("{}");
  await page.getByRole("button", { name: "Publish event" }).click();
  const invalid = page
    .getByRole("alert")
    .filter({ hasText: "does not satisfy the event's schema" });
  await expect(invalid).toContainText("Nothing was sent.");
  await expect(invalid.getByRole("row", { name: /orderId/ })).toContainText("Missing");
  expect(sent).toEqual([]);

  await payload.fill('{"orderId":"order-7"}');
  await page.getByRole("button", { name: "Publish event" }).click();
  const dialog = page.getByRole("dialog", { name: "Publish orders.created?" });
  await expect(dialog).toContainText("Publishes a new event; its reactions will run.");
  expect(sent).toEqual([]);
  await dialog.getByRole("button", { name: "Publish event" }).click();
  const form = page.locator("form").filter({ has: payload });
  await expect(form.getByRole("status")).toContainText("Published orders.created");
  await expect(form.getByRole("link", { name: "Show the publication" })).toBeVisible();
  expect(sent).toHaveLength(1);

  await page.getByRole("button", { name: "Replay publication event-instance-1" }).click();
  const replay = page.getByRole("dialog", { name: "Replay publication event-instance-1?" });
  await expect(replay).toContainText("Nothing new is published.");
  await replay.getByRole("button", { name: "Replay" }).click();
  const row = page.locator("#publication-event-instance-1");
  await expect(row.getByRole("status")).toContainText(
    "Delivered publication event-instance-1 again to its reactions. Nothing new was published.",
  );

  // The row says when it happened and links to its trace.
  await expect(row.locator("time")).toBeVisible();
  await expect(row.getByRole("link", { name: "Open trace" })).toBeVisible();
});

test("a provider that cannot retry a delivery says so beside the delivery", async ({ page }) => {
  await page.route("**/_relkit/v1/actions/events/delivery-dead-letter-1/retry", (route) =>
    route.fulfill({
      status: 501,
      json: { ...rejected(), action: "event.retry", error: "RELKIT_INSPECTOR_ACTION_UNSUPPORTED" },
    }),
  );
  await page.goto("/events/orders.created");
  await page.getByRole("button", { name: "Retry delivery delivery-dead-letter-1" }).click();
  await page
    .getByRole("dialog", { name: "Retry delivery delivery-dead-letter-1?" })
    .getByRole("button", { name: "Retry" })
    .click();
  const row = page
    .getByRole("list", { name: "Delivery actions" })
    .getByRole("listitem")
    .filter({ hasText: "delivery-dead-letter-1" });
  await expect(row.getByRole("alert")).toHaveText("This provider cannot retry a delivery.");
});

/** Serves `count` deliveries of `orders.created` from the runtime events collection. */
function deliveries(count: number, from = 0) {
  return Array.from({ length: count }, (_, index) => ({
    protocol: "relkit.events.admin",
    version: 1,
    deliveryId: `delivery-${from + index}`,
    eventInstanceId: "event-instance-1",
    eventId: "orders.created",
    eventVersion: 1,
    triggerId: "orders.project-any-change",
    state: "completed",
    attempt: 1,
    timestamp: "2026-01-01T00:00:00.000Z",
  }));
}

test("an event with several pages of deliveries loads them all and lists the newest first", async ({
  page,
}) => {
  await patch(page, /\/_relkit\/v1\/runtime\/events\?/, (payload, route) => {
    const more = new URL(route.request().url()).searchParams.get("cursor") === "100";
    const items = more ? deliveries(20, 100) : deliveries(100);
    Object.assign(payload, {
      items,
      deliveries: items,
      deadLetters: [],
      ...(more ? { nextCursor: undefined } : { nextCursor: "100" }),
    });
  });
  await page.goto("/events/orders.created");
  await expect(page.getByRole("heading", { name: /newest first/ })).toBeVisible();
  await expect(page.getByLabel("120 deliveries")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load more deliveries" })).toHaveCount(0);
  // The API lists the oldest first; the last page holds the newest, and it is on top.
  await expect(
    page.getByRole("list", { name: "Delivery attempts" }).getByRole("listitem").first(),
  ).toContainText("delivery-119");
});

test("an event whose provider reports a total shows the real total and counts", async ({
  page,
}) => {
  await patch(page, /\/_relkit\/v1\/runtime\/events\?/, (payload) => {
    const items = deliveries(100);
    Object.assign(payload, {
      items,
      deliveries: items,
      deadLetters: [],
      nextCursor: "100",
      total: 230,
      counts: { completed: 228, "dead-lettered": 2 },
    });
  });
  await page.goto("/events/orders.created");
  await expect(page.getByLabel("230 deliveries")).toBeVisible();
  await expect(page.getByText("228", { exact: true })).toBeVisible();
  await expect(page.getByText(/counts cover the/)).toHaveCount(0);
});

type HistorySeed = { readonly declared: number; readonly serverErrors: number };

test("the Errors page counts occurrences and links to the failures no error describes", async ({
  page,
  request,
}) => {
  const seed = (await (await request.post(`${backend}/__fixture__/history`)).json()) as HistorySeed;
  await patch(page, /\/_relkit\/v1\/errors\?/, (payload) => {
    payload.items = Array.from({ length: 20 }, (_, index) => ({
      kind: "error",
      id: index === 0 ? "fleet.plate-taken" : `fleet.error-${index}`,
      domainId: "fleet",
      http: { status: 409 },
    }));
    payload.total = 23;
    payload.nextCursor = "20";
  });
  await page.goto("/errors");
  await expect(page.getByText("20 of 23", { exact: true })).toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "fleet.plate-taken" });
  await expect(row.getByRole("link", { name: `${seed.declared} requests` })).toHaveAttribute(
    "href",
    "/requests?errorId=fleet.plate-taken",
  );
  await expect(
    page
      .getByRole("row")
      .filter({ has: page.getByText("fleet.error-1", { exact: true }) })
      .getByText("none retained"),
  ).toBeVisible();
  const unexpected = page.locator("#unexpected-failures");
  await expect(unexpected).toContainText(/\d+ retained requests ended with an unexpected failure/);
  await expect(unexpected.getByRole("link", { name: "View these requests" })).toHaveAttribute(
    "href",
    "/requests?outcome=defect",
  );
  await page.getByRole("link", { name: `${seed.declared} requests` }).click();
  await expect(page).toHaveURL(/\/requests\?errorId=fleet\.plate-taken$/);
});

test("the Jobs pages say none are declared when the jobs API answers 404 Problem Details", async ({
  page,
}) => {
  await page.route(/\/_relkit\/v1\/jobs(\/|\?|$)/, (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/problem+json",
      body: JSON.stringify({ type: "about:blank", title: "Not Found", status: 404 }),
    }),
  );
  for (const path of ["/jobs", "/jobs/runs", "/jobs/schedules", "/jobs/services"]) {
    await page.goto(path);
    await expect(page.getByText("This application declares no jobs.")).toBeVisible();
    await expect(page.getByText(/defineJob/)).toBeVisible();
    await expect(page.getByText(/jobs API is unavailable|are unavailable/)).toHaveCount(0);
  }
});

test("a jobs service that cannot be reached is still reported as unavailable", async ({ page }) => {
  await page.route(/\/_relkit\/v1\/jobs(\/|\?|$)/, (route) => route.abort());
  await page.goto("/jobs/services");
  await expect(page.getByText("Jobs services are unavailable.")).toBeVisible();
  await expect(page.getByText("This application declares no jobs.")).toHaveCount(0);
});

test("empty resource pages tell none declared from no match", async ({ page }) => {
  await page.goto("/middlewares");
  await expect(page.getByText("This application declares no middleware.")).toBeVisible();
  await expect(page.getByText(/defineMiddleware/)).toBeVisible();
  await expect(page.getByText(/match the active filters/)).toHaveCount(0);

  await page.goto("/functions");
  await page.getByLabel("Search functions").fill("no-such-function");
  await expect(page.getByText("No functions match the active filters.")).toBeVisible();
  await page.getByRole("button", { name: "Show all functions" }).click();
  await expect(page.getByRole("link", { name: "Open function" }).first()).toBeVisible();
});

test("the Routes page lists system routes apart from the declared ones", async ({ page }) => {
  await page.goto("/routes");
  await expect(page.getByRole("link", { name: "Open route" })).toHaveCount(2);
  const section = page.locator("#system-routes");
  await expect(section.getByRole("heading", { name: "System routes" })).toBeVisible();
  await expect(section).toContainText("/healthz");
  await expect(section.getByRole("link", { name: /\/healthz/ })).toHaveAttribute(
    "href",
    "/requests?routeId=relkit.system.health",
  );
  await expect(section.getByRole("link", { name: /relkit\.rpc|rpc/i }).first()).toHaveAttribute(
    "href",
    /\/requests\?routeId=relkit\.rpc/,
  );
  await expect(section.getByRole("button", { name: "Send request" })).toHaveCount(0);
  // The table and its count hold the two declared routes only.
  await expect(page.getByRole("table").getByText("relkit.system.health")).toHaveCount(0);
  await expect(page.locator(".page-heading").getByText("2", { exact: true })).toBeVisible();
});

test("bucket rows show type and time and flag a type that contradicts the key", async ({
  page,
}) => {
  await patch(page, /\/_relkit\/v1\/runtime\/buckets\/assets\/objects\?/, (payload) => {
    payload.items = [
      {
        key: "images/pic.png",
        size: 2048,
        lastModified: "2026-11-01T10:00:00.000Z",
        metadata: { contentType: "application/x-msdownload" },
      },
      {
        key: "docs/readme.txt",
        size: 31,
        lastModified: "2026-11-01T11:00:00.000Z",
        metadata: { contentType: "text/plain" },
      },
    ];
    delete payload.nextCursor;
  });
  await page.route(/\/objects\/preview\?key=images%2Fpic\.png/, (route) =>
    route.fulfill({
      json: {
        ...envelope,
        supported: true,
        key: "images/pic.png",
        kind: "metadata-only",
        metadata: {
          contentType: "application/x-msdownload",
          lastModified: "2026-11-01T10:00:00.000Z",
        },
        totalBytes: 2048,
        truncated: false,
      },
    }),
  );
  await page.goto("/buckets/assets");
  const png = page.getByRole("row").filter({ hasText: "pic.png" });
  await expect(png).toContainText("application/x-msdownload");
  await expect(png).toContainText("modified");
  await expect(png).toContainText("type differs from .png");
  const text = page.getByRole("row").filter({ hasText: "readme.txt" });
  await expect(text).toContainText("text/plain");
  await expect(text).not.toContainText("type differs");

  await png.getByRole("button", { name: "Preview" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("does not match the .png extension");
  await expect(dialog).toContainText("Content type");
  await expect(dialog).toContainText("2,048 bytes");
});

test("a PDF preview shows its metadata and a download, and says when it is not a PDF", async ({
  page,
}) => {
  await page.goto("/buckets/assets");
  await page
    .getByRole("row")
    .filter({ hasText: "documents/sample.pdf" })
    .getByRole("button", { name: "Preview" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("link", { name: "Download sample.pdf" })).toBeVisible();
  await expect(dialog.getByText("Content type")).toBeVisible();
  await expect(dialog.locator("iframe")).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.route(/\/objects\/preview\?key=documents%2Fsample\.pdf/, (route) =>
    route.fulfill({
      json: {
        ...envelope,
        supported: true,
        key: "documents/sample.pdf",
        kind: "pdf",
        content: Buffer.from("not a pdf").toString("base64"),
        metadata: { contentType: "application/pdf" },
        totalBytes: 9,
        truncated: false,
      },
    }),
  );
  await page.reload();
  await page
    .getByRole("row")
    .filter({ hasText: "documents/sample.pdf" })
    .getByRole("button", { name: "Preview" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("This object is not a valid PDF");
});

test("the Providers page words the source as provenance and shows the reported health", async ({
  page,
}) => {
  const binding = (capability: string, kind: string) => ({
    kind: "provider",
    id: `provider.${capability}.default`,
    capability,
    profile: "default",
    providerSource: { kind },
    adapter: { adapterId: `${capability}-adapter`, integrationId: "fixture" },
    namedValues: [],
  });
  await patch(page, /\/_relkit\/v1\/providers\?/, (payload) => {
    payload.items = [
      binding("bucket", "connected"),
      binding("cache", "connected"),
      binding("database", "local-only"),
    ];
    delete payload.nextCursor;
  });
  await page.goto("/providers");
  await expect(page.getByText("2 of 3 have a release source")).toBeVisible();
  await expect(page.getByText(/\d+\/\d+ connected/)).toHaveCount(0);
  const database = page.getByRole("listitem").filter({ hasText: "provider.database.default" });
  await expect(database.getByText("local only")).toBeVisible();
  await expect(database.getByText("health not reported")).toBeVisible();
  const bucket = page.getByRole("listitem").filter({ hasText: "provider.bucket.default" });
  await expect(bucket.getByText("ready", { exact: true })).toBeVisible();
});

test("the Env page holds its width at 900 px with a long graph hash and long names", async ({
  page,
}) => {
  test.slow();
  const hash = `sha256:${"a".repeat(64)}`;
  await page.route(/\/_relkit\/v1\/(env|graph)(\?|$)/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text())
      .replace(/sha256:[\w-]+/g, hash)
      .replace(/"name":"([A-Z_]+)"/g, '"name":"LOGISTICS_$1_PRIMARY_DATABASE_CONNECTION_STRING"');
    await route.fulfill({ response, body });
  });
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/env");
  await expect(page.getByRole("heading", { name: "Environment", level: 1 })).toBeVisible();
  await expect(page.getByText(hash)).toBeVisible();
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
});
