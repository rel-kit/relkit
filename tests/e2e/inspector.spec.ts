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
  await page.getByRole("link", { name: "Open route" }).first().click();
  await expect(page.getByRole("heading", { name: "Route detail" })).toBeVisible();

  await page.getByLabel(/orderId \(header\)/).fill("order-100");
  await page.getByLabel(/customerEmail \(header\)/).fill("buyer@example.com");
  await page.getByLabel(/sku \(body\)/).fill("sku-1");
  await page.getByLabel(/quantity \(body\)/).fill("2");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByRole("heading", { name: "Active backend result" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open request record" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open trace" })).toBeVisible();
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
  await expect(page.getByRole("link", { name: "Trace" }).last()).toBeVisible();

  await page.getByRole("link", { name: "Traces" }).click();
  await expect(page.getByRole("heading", { name: "Traces" })).toBeVisible();
  await expect(page.getByText("trace-live-0002")).toBeVisible();
  await page.locator('a[href="/traces/trace-live-0002"]').click();
  await expect(page.getByRole("heading", { name: "Trace detail" })).toBeVisible();
});

test("renders every required inspector page", async ({ page }) => {
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
  await expect(page.getByRole("heading", { name: "Listeners" })).toBeVisible();
  await expect(page.getByText(/generic triggers/)).toBeVisible();
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
    if (request.url().includes("/_zsys/v1/") && request.postData() !== null)
      payloads.push(
        Promise.resolve({ label: `request ${request.url()}`, body: request.postData()! }),
      );
  });
  page.on("response", (response) => {
    const contentType = response.headers()["content-type"] ?? "";
    const apiResponse = response.url().includes("/_zsys/v1/") && contentType.includes("json");
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
  expect(networkBodies.some(({ body }) => body.includes('"protocol":"zsys.inspector"'))).toBe(true);
  assertNoRawSyntheticSecrets("browser network responses", networkBodies);
  assertNoRawSyntheticSecrets("inspector server-rendered HTML", await page.content());
  expect(networkBodies.flatMap(({ label, body }) => payloadViolations(label, body))).toEqual([]);

  const bundles = await scanInspectorBundles(repositoryRoot);
  expect(bundles.browserFiles).toBeGreaterThan(0);
  expect(bundles.serverFiles).toBeGreaterThan(0);
  expect(bundles.violations).toEqual([]);
});
