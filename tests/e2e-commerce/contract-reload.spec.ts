/** A backend contract change in development reaches the running frontend without a restart. */
import { expect, test } from "@playwright/test";
import { playwrightSelection } from "../../scripts/playwright-selection.js";
import { CONTRACT_CONTROL_PATH } from "../e2e/commerce-dev-contract.js";

const selected = playwrightSelection("commerce");
const identityUrl = `${selected.backend}/_relkit/v1/client/identity`;

test("the client adopts a published backend contract without a frontend restart", async ({
  page,
  request,
}) => {
  const fingerprints: string[] = [];
  page.on("response", (response) => {
    if (response.url() !== identityUrl || response.status() !== 200) return;
    void response
      .json()
      .then((document: { readonly publicFingerprint: string }) =>
        fingerprints.push(document.publicFingerprint),
      )
      .catch(() => undefined);
  });
  await page.goto("/");
  await expect(page.getByText("Channel: connected; caught up: true")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "RelKit" })).toHaveCount(0);
  await expect.poll(() => fingerprints.length).toBeGreaterThan(0);

  const next = `sha256:${"e".repeat(64)}`;
  const announcements = page.waitForRequest((sent) =>
    sent.url().startsWith(`${selected.backend}/rpc/api/announcements/`),
  );
  const published = await request.post(`${selected.backend}${CONTRACT_CONTROL_PATH}`, {
    data: { publicFingerprint: next },
  });
  expect(published.status()).toBe(204);

  // The client re-reads its identity, refetches its queries under the new contract,
  // and does not ask for a restart.
  await expect.poll(() => fingerprints.at(-1)).toBe(next);
  await announcements;
  await expect(page.getByRole("alert").filter({ hasText: "RelKit" })).toHaveCount(0);
  await page.getByRole("button", { name: "Post announcement" }).click();
  await expect(page.getByRole("status")).toContainText("Posted");
});
