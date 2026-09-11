import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { payloadViolations, scanInspectorBundles } from "../inspector/inspector-scans";
import { assertNoRawSyntheticSecrets } from "../../scripts/secret-scan";

const backend = "http://127.0.0.1:3212";
const graphHash = "sha256:commerce-inspector-fixture-v1";
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));

test.beforeEach(async ({ request }) => {
  await request.post(`${backend}/__fixture__/reset`);
});

test("loads the active graph and follows route/detail/composer flows", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText(graphHash).first()).toBeVisible();

  await page.getByRole("link", { name: "Routes" }).click();
  await expect(page.getByRole("heading", { name: "Routes" })).toBeVisible();
  await page.goto("/routes/orders.create.http");
  await expect(page.getByRole("heading", { name: "Route detail" })).toBeVisible();

  await page.getByLabel(/orderId \(header\)/).fill("order-100");
  await page.getByLabel(/customerEmail \(header\)/).fill("buyer@example.com");
  await page.getByLabel(/sku \(body\)/).fill("sku-1");
  await page.getByLabel(/quantity \(body\)/).fill("2");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("heading", { name: "Active backend result" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open request record" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open trace" })).toHaveCount(0);
});

test("keeps contracts available when observability is unavailable", async ({ page }) => {
  await page.route(/\/_relkit\/v1\/(?:requests|logs|traces)(?:\?|$)/, (route) => route.abort());

  await page.goto("/routes/orders.create.http");
  await expect(page.getByRole("heading", { name: "Route detail" })).toBeVisible();
  await page.goto("/functions/orders.create");
  await expect(page.getByRole("heading", { name: "Function detail" })).toBeVisible();
  await page.goto("/tools/orders.get.tool");
  await expect(page.getByRole("heading", { name: "Tool detail" })).toBeVisible();
  await page.goto("/agents/support.order");
  await expect(page.getByRole("heading", { name: "Agent detail" })).toBeVisible();
  await page.getByRole("link", { name: "Open chat" }).click();
  await expect(page.getByRole("heading", { name: "support.order" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conversation" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Agent activity" })).toBeVisible();
});

test("runs, resumes, restores, and visualizes a graph without leaking private state", async ({
  page,
}) => {
  await page.goto("/agents/support.order/chat");
  await page.getByLabel("Message the agent").fill("Review the order");
  await page.getByLabel("Message the agent").press("Enter");

  const conversation = page.getByRole("region", { name: "Conversation" });
  await expect(conversation.getByText("Human input required")).toBeVisible();
  await expect(conversation.getByRole("complementary", { name: "Agent todo state" })).toContainText(
    "Ask for approval",
  );
  await expect(conversation.getByText("orders.get.tool")).toBeVisible();
  await expect(conversation).not.toContainText("The order was rejected.");
  const threadId = new URL(page.url()).searchParams.get("thread");
  expect(threadId).toBeTruthy();

  await conversation.getByLabel("Decision").selectOption("false");
  await conversation.getByRole("button", { name: "Resume" }).click();
  await expect(conversation.getByText("The order was rejected.")).toBeVisible();
  await expect(conversation.getByRole("complementary", { name: "Agent todo state" })).toContainText(
    "completed",
  );
  await page.getByRole("button", { name: "Thread history" }).click();
  await expect(page.getByText("Review the order").last()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(conversation.getByText("The order was rejected.")).toBeVisible();

  await expect(page.getByRole("tab", { name: "Graph" })).toHaveCount(0);

  await page.getByRole("link", { name: "Graphs" }).click();
  await expect(page.getByRole("heading", { name: "Graphs" })).toBeVisible();
  await page.getByRole("link", { name: "Open graph" }).click();
  const workflow = page.getByRole("region", { name: "orders.review node graph" });
  await expect(workflow).toBeVisible();
  await expect(workflow.locator(".flow-node--agent,.flow-node--tool")).toHaveCount(0);
  await expect(workflow.getByText("START", { exact: true })).toBeVisible();
  await expect(workflow.getByText("END", { exact: true })).toBeVisible();
  for (const edge of ["conditional:approved", "parallel", "join", "loop"])
    await expect(workflow.getByText(edge, { exact: true }).first()).toBeVisible();
  const start = await workflow.locator(".flow-node--graph-start").boundingBox();
  const end = await workflow.locator(".flow-node--graph-end").boundingBox();
  expect(start?.y).toBeLessThan(end?.y ?? 0);

  await page.goto("/graph");
  const graph = page.getByRole("region", { name: "Interactive capability graph" });
  await expect(graph).toBeVisible();
  for (const kind of ["graph-start", "graph-end", "subgraph", "subagent", "resource-memory"])
    await expect(graph.locator(`.flow-node--${kind}`)).toHaveCount(1);
  await page.getByLabel("Thread ID").fill(threadId!);
  await page.getByRole("combobox", { name: "Agent", exact: true }).selectOption("support.order");
  await page.getByLabel("Runs").selectOption("history");
  await page.getByRole("button", { name: "Show execution" }).click();
  await expect(graph.locator(".flow-node--observed").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("sk-live-fixture-secret");

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("opens raw route details without looking up a nonexistent function", async ({ page }) => {
  const functionRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/functions/raw.details")) functionRequests.push(request.url());
  });
  await page.route("**/_relkit/v1/routes/raw.details", (route) =>
    route.fulfill({
      json: {
        protocol: "relkit.inspector",
        version: 1,
        node: {
          id: "raw.details",
          kind: "trigger",
          targetFunctionId: "raw.details",
          config: {
            method: "GET",
            path: "/users/:id/details",
            rawHandler: true,
            request: null,
            responses: [],
            middleware: [],
            transforms: [],
          },
        },
      },
    }),
  );
  await page.goto("/routes/raw.details");
  await expect(page.getByRole("heading", { name: "Route detail", exact: true })).toBeVisible();
  await expect(page.getByText("Raw HTTP handler").first()).toBeVisible();
  await expect(page.getByText("The route API is unavailable.")).toHaveCount(0);
  expect(functionRequests).toEqual([]);
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

  await page.getByRole("link", { name: "Functions" }).click();
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
  const spanDialog = page.getByRole("dialog", { name: "HTTP POST /orders" });
  await expect(spanDialog).toBeVisible();
  await spanDialog.getByRole("tab", { name: "Metadata" }).click();
  await expect(spanDialog.getByText(/relkit\.request\.id/)).toBeVisible();
  await spanDialog.getByRole("tab", { name: "Events" }).click();
  await expect(spanDialog.getByText(/http\.request\.received/)).toBeVisible();

  await request.post(`${backend}/__fixture__/release`);
  await pending;
  await expect(page.getByText("http.response.completed", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Continuations" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open trace" })).toBeVisible();

  await page.reload();
  await expect(page.getByText("request-paused-0001").first()).toBeVisible();
  await expect(page.getByText("http.request.received", { exact: false })).toHaveCount(1);
  await page.getByRole("link", { name: /222222222222/ }).click();
  await expect(page.getByRole("heading", { name: "Trace detail" })).toBeVisible();
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
    await page.getByRole("tab", { name: "Metadata" }).click();
    await expect(page.getByText(/"attributes": 2/)).toBeVisible();
  }
});

test("renders every required inspector page", async ({ page }) => {
  test.slow();
  const pages = [
    ["/", "Overview"],
    ["/graph", "Graph"],
    ["/routes", "Routes"],
    ["/functions", "Functions"],
    ["/jobs", "Jobs"],
    ["/events", "Events"],
    ["/buckets", "Buckets"],
    ["/cache", "Cache"],
    ["/tools", "Tools"],
    ["/agents", "Agents"],
    ["/requests", "Requests"],
    ["/logs", "Logs"],
    ["/traces", "Traces"],
    ["/env", "Environment"],
    ["/diagnostics", "Diagnostics"],
  ] as const;

  for (const [path, heading] of pages) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  }

  await page.goto("/buckets");
  await expect(page.getByRole("link", { name: "Open bucket" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Open bucket" }).first().click();
  await expect(page.getByRole("heading", { name: "Bucket detail" })).toBeVisible();

  await page.goto("/cache");
  await expect(page.getByRole("link", { name: "Open cache" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Open cache" }).first().click();
  await expect(page.getByRole("heading", { name: "Cache detail" })).toBeVisible();

  await page.goto("/tools");
  await expect(page.getByRole("link", { name: "Open tool" }).first()).toBeVisible();
  await page.getByRole("link", { name: "Open tool" }).first().click();
  await expect(page.getByRole("heading", { name: "Tool detail" })).toBeVisible();
});

test("uses event terminology, local job actions, diagnostics, agent tools, and source links", async ({
  page,
}) => {
  await page.goto("/events");
  await page.getByRole("link", { name: "Open event" }).first().click();
  await expect(page.getByRole("heading", { name: "Event detail" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Consumer functions" })).toBeVisible();
  await expect(page.getByText(/event-only functions/)).toBeVisible();
  await expect(page.getByText(/subscription/i)).toHaveCount(0);

  await page.getByRole("link", { name: "Jobs" }).click();
  await page.getByRole("link", { name: "Open job" }).first().click();
  await page.getByRole("button", { name: "Retry dead letter" }).click();
  await expect(page.getByRole("dialog", { name: "Retry dead-lettered job?" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Retry job" }).click();
  await expect(page.getByText(/available/).first()).toBeVisible();

  await page.getByRole("link", { name: "Diagnostics" }).click();
  await expect(page.getByRole("heading", { name: "Active generation" })).toBeVisible();
  await page.request.post(`${backend}/__fixture__/candidate`, { data: { invalid: true } });
  await expect(page.getByRole("heading", { name: "Candidate diagnostics" })).toBeVisible();
  await expect(page.getByText("commerce-generation-1").first()).toBeVisible();
  await expect(page.getByText(graphHash).first()).toBeVisible();
  await expect(page.getByText("commerce-candidate-2")).toBeVisible();

  await page.getByRole("link", { name: "Agents" }).click();
  await page.getByRole("link", { name: "Open agent" }).first().click();
  await expect(page.getByRole("heading", { name: "Model and tool spans" })).toBeVisible();
  await expect(page.getByText("tool").first()).toBeVisible();
  await expect(page.getByText("orders.get.tool").first()).toBeVisible();

  await page.getByRole("link", { name: "Routes" }).click();
  await page.getByRole("link", { name: "Open route" }).first().click();
  const source = page.getByRole("link", { name: "src/routes/create-order.route.ts:3:1" });
  await expect(source).toHaveAttribute(
    "href",
    "vscode://file/src/routes/create-order.route.ts:3:1",
  );
});

test("keeps critical controls usable on a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/routes/orders.create.http");
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send request" })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("scans inspector bundles and network payloads for boundary leaks", async ({ page }) => {
  const payloads: Array<Promise<{ readonly label: string; readonly body: string }>> = [];
  page.on("request", (request) => {
    if (request.url().includes("/_relkit/v1/") && request.postData() !== null)
      payloads.push(
        Promise.resolve({ label: `request ${request.url()}`, body: request.postData()! }),
      );
  });
  page.on("response", (response) => {
    const contentType = response.headers()["content-type"] ?? "";
    const apiResponse = response.url().includes("/_relkit/v1/") && contentType.includes("json");
    const browserBundle = response.request().resourceType() === "script";
    if (apiResponse || browserBundle)
      payloads.push(
        response
          .text()
          .then((body) => ({ label: `response ${response.url()}`, body }))
          .catch(() => ({ label: `response ${response.url()}`, body: "" })),
      );
  });

  await page.goto("/");
  await expect(page.getByText(graphHash).first()).toBeVisible();
  const networkBodies = await Promise.all(payloads);
  expect(networkBodies.length).toBeGreaterThan(0);
  expect(networkBodies.some(({ body }) => body.includes('"protocol":"relkit.inspector"'))).toBe(
    true,
  );
  assertNoRawSyntheticSecrets("browser network responses", networkBodies);
  assertNoRawSyntheticSecrets("inspector server-rendered HTML", await page.content());
  expect(networkBodies.flatMap(({ label, body }) => payloadViolations(label, body))).toEqual([]);

  const bundles = await scanInspectorBundles(repositoryRoot);
  expect(bundles.browserFiles).toBeGreaterThan(0);
  expect(bundles.serverFiles).toBeGreaterThan(0);
  expect(bundles.violations).toEqual([]);
});
