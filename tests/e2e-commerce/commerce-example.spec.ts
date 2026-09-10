import { expect, test } from "@playwright/test";

test("announcements synchronize connected tabs and restore a late tab", async ({ browser }) => {
  const senderContext = await browser.newContext();
  const receiverContext = await browser.newContext();
  const sender = await senderContext.newPage();
  const receiver = await receiverContext.newPage();
  try {
    await Promise.all([
      sender.goto("http://127.0.0.1:3010"),
      receiver.goto("http://127.0.0.1:3010"),
    ]);
    await expect(sender.getByText("Channel: connected; caught up: true")).toBeVisible();
    await expect(receiver.getByText("Channel: connected; caught up: true")).toBeVisible();

    await sender.getByRole("button", { name: "Post announcement" }).click();
    await expect(sender.getByRole("status")).toContainText("Posted");
    const message = await sender.locator("li").last().textContent();
    expect(message).toMatch(/^Update \d+$/);
    await expect(receiver.getByText(message!, { exact: true })).toBeVisible();

    const lateContext = await browser.newContext();
    try {
      const late = await lateContext.newPage();
      await late.goto("http://127.0.0.1:3010");
      await expect(late.getByText(message!, { exact: true })).toBeVisible();
    } finally {
      await lateContext.close();
    }
  } finally {
    await Promise.all([senderContext.close(), receiverContext.close()]);
  }
});

test("commerce support agent negotiates capabilities and settles its streamed run", async ({
  page,
}) => {
  const identity = page.waitForResponse(
    (response) =>
      response.url() === "http://127.0.0.1:4010/_relkit/v1/client/identity" &&
      response.status() === 200,
  );
  await page.goto("/");
  await identity;

  await page.getByRole("button", { name: "Ask support agent" }).click();

  await expect(page.getByText("assistant: Order demo-1 is ready.")).toBeVisible();
  await expect(page.getByText("Support: succeeded; latest run: succeeded")).toBeVisible();
  await expect(
    page.getByText("Todos: completed: Find the order, completed: Explain its state"),
  ).toBeVisible();
  await expect(page.getByText("AGENT_CAPABILITIES_UNSUPPORTED")).toHaveCount(0);
});
