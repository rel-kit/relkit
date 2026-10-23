/** Scans the running Inspector's actual selected bundles and network payloads against the original secret/boundary rules. */
import { expect, test } from "@playwright/test";
import { playwrightSelection } from "../../scripts/playwright-selection.js";
const { backend } = playwrightSelection("inspector");
test.beforeEach(async ({ request }) => {
  await request.post(`${backend}/__fixture__/reset`);
});
import { fileURLToPath } from "node:url";
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
