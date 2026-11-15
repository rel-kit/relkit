/** Scans the running Inspector's actual selected bundles and network payloads against the original secret/boundary rules. */
import { expect, test } from "@playwright/test";
import { playwrightSelection } from "../../scripts/playwright-selection.js";
const { backend } = playwrightSelection("inspector");
test.beforeEach(async ({ request }) => {
  await request.post(`${backend}/__fixture__/reset`);
});
import { fileURLToPath } from "node:url";
import { FAILURE_FIXTURE_IDS } from "../inspector/fixture-failures";
import { payloadViolations, scanInspectorBundles } from "../inspector/inspector-scans";
import { assertNoRawSyntheticSecrets } from "../../scripts/secret-scan";
const graphHash = "sha256:commerce-inspector-fixture-v1";
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
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

  const bundles = await scanInspectorBundles(repositoryRoot, playwrightSelection("inspector").dist);
  expect(bundles.browserFiles).toBeGreaterThan(0);
  expect(bundles.serverFiles).toBeGreaterThan(0);
  expect(bundles.violations).toEqual([]);
});

test("shows the function's captured input and result and says what is never recorded", async ({
  page,
  request,
}) => {
  await request.post(`${backend}/__fixture__/failures`);
  await page.goto(`/requests/${FAILURE_FIXTURE_IDS.captured}`);
  const panel = page.getByRole("region", { name: "Function input and result" });
  await expect(panel.getByRole("heading", { name: "Function input", exact: true })).toBeVisible();
  await expect(panel.getByText(/"sku": "sku-1"/)).toBeVisible();
  await expect(panel.getByText(/"apiKey": "\[redacted\]"/)).toBeVisible();
  await expect(
    panel.getByText(/Redacted: protected values show as \[redacted\]. 38 bytes./),
  ).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Function result", exact: true })).toBeVisible();
  await expect(
    panel.getByText("Larger than the 4,096-byte capture limit, so it was not kept."),
  ).toBeVisible();
  await expect(
    panel.getByText("HTTP headers and raw request and response bodies are not recorded."),
  ).toBeVisible();
  await expect(page.getByText("Not retained by the active backend")).toHaveCount(0);
  await expect(page.getByText("Request headers")).toHaveCount(0);
});

test("says when capture is off and when no function ran", async ({ page, request }) => {
  await request.post(`${backend}/__fixture__/failures`);
  await page.goto(`/requests/${FAILURE_FIXTURE_IDS.defectDev}`);
  const off = page.getByRole("region", { name: "Function input and result" });
  await expect(off.getByText("Not captured. Capture is off in this application.")).toHaveCount(2);
  await expect(off.getByText(/telemetry\.redaction/)).toBeVisible();

  await page.goto(`/requests/${FAILURE_FIXTURE_IDS.auth}`);
  const none = page.getByRole("region", { name: "Function input and result" });
  await expect(none.getByText("This request did not reach a function")).toBeVisible();
  await expect(none.getByRole("heading", { name: "Function input", exact: true })).toHaveCount(0);
  await expect(
    none.getByText("HTTP headers and raw request and response bodies are not recorded."),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Request record" }).getByRole("link", { name: "relkit.auth" }),
  ).toBeVisible();
});
