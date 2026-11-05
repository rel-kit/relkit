/** Event, job and MCP tool actions in the Inspector UI, driven against the browser fixture. */
import type { BrowserAcceptanceDriver } from "./test-inspector-agent-browser.js";

/** Runs the action scenarios in order; each starts from its own page.
 * @param driver - Owned browser session and assertion helpers.
 * @returns Completion after every action and assertion.
 */
export async function runActionsBrowserAcceptance(driver: BrowserAcceptanceDriver): Promise<void> {
  await eventActions(driver);
  await jobTrigger(driver);
  await mcpToolCall(driver);
}

async function eventActions(driver: BrowserAcceptanceDriver): Promise<void> {
  const { baseUrl, run, snapshot, reference, includes } = driver;
  await run("open", `${baseUrl}/events/orders.created`);
  await run("wait", "--text", "Event actions");
  let tree = await snapshot();
  await run("fill", reference(tree, 'textbox "Event payload (JSON)"'), '{"orderId":"order-200"}');
  await run("click", reference(tree, 'button "Publish event"'));
  await run("wait", "--text", "Published orders.created.");
  await run("wait", "--text", "event-instance-2");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Replay publication event-instance-1"'));
  await run("wait", "--text", "Replayed publication event-instance-1.");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Cancel delivery delivery-3"'));
  await run("wait", "--text", "Cancelled delivery delivery-3.");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Retry delivery delivery-dead-letter-1"'));
  await run("wait", "--text", "Retried delivery delivery-dead-letter-1.");
  includes(await run("eval", "document.body.innerText.includes('delivery-2')"), "true");
}

async function jobTrigger(driver: BrowserAcceptanceDriver): Promise<void> {
  const { baseUrl, run, snapshot, reference, includes } = driver;
  await run("open", `${baseUrl}/jobs/receipts.send-job`);
  await run("wait", "--text", "Trigger a run");
  const tree = await snapshot();
  await run("fill", reference(tree, 'textbox "Job input (JSON)"'), '{"orderId":"order-200"}');
  await run("click", reference(tree, 'button "Trigger job"'));
  await run("wait", "--url", "**/jobs/runs/receipts.send-job-run-1");
  includes(await run("get", "url"), "/jobs/runs/receipts.send-job-run-1");
}

async function mcpToolCall(driver: BrowserAcceptanceDriver): Promise<void> {
  const { baseUrl, run, snapshot, reference } = driver;
  await run("open", `${baseUrl}/mcp`);
  await run("wait", "--text", "orders.get.tool");
  let tree = await snapshot();
  await run(
    "fill",
    reference(tree, 'textbox "Arguments for orders.get.tool (JSON)"'),
    '{"orderId":"order-100"}',
  );
  await run("click", reference(tree, 'button "Call orders.get.tool"'));
  await run("wait", "--text", "Called orders.get.tool.");
  tree = await snapshot();
  await run("click", reference(tree, 'link "Open trace'));
  await run("wait", "--text", "Trace detail");
  await run("wait", "--text", "Inspector called orders.get.");
}
