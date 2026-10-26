/** Preserves native agent approval/resume/history and graph visualization assertions independently from server ownership. */
import { expect, test, type Page } from "@playwright/test";
import { playwrightSelection } from "../../scripts/playwright-selection.js";
const { backend } = playwrightSelection("inspector");
test.beforeEach(async ({ request }) => {
  await request.post(`${backend}/__fixture__/reset`);
});
test("runs, resumes, restores, and visualizes a graph without leaking private state", async ({
  page,
}) => {
  const threadId = await resumeConversation(page);
  await inspectWorkflow(page);
  await inspectObservedGraph(page, threadId);
});

/** Keeps the original native approval, persistence and restored-history flow. */
async function resumeConversation(page: Page): Promise<string | null> {
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

  return threadId;
}

/** Keeps declared workflow topology separate from observed execution overlay. */
async function inspectWorkflow(page: Page): Promise<void> {
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
}

/** Keeps the original selected-thread overlay, secret and narrow viewport checks. */
async function inspectObservedGraph(page: Page, threadId: string | null): Promise<void> {
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
}
