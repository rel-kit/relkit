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
  await confirm(driver, "Publish orders.created?", "Publish event");
  const published = await publicationNamedBy(
    driver,
    "Published orders\\.created(?: v\\d+)? as publication (event-instance-\\d+)\\.",
  );
  tree = await snapshot();
  await run("click", reference(tree, 'button "Replay publication event-instance-1"'));
  await confirm(driver, "Replay publication event-instance-1?", "Replay");
  if (published === "event-instance-1")
    throw new Error("Publish named the publication that already existed.");
  // A replay delivers the stored publication again and publishes nothing new, so the sentence
  // names the publication that was replayed; it must still be a listed publication.
  const replayed = await publicationNamedBy(
    driver,
    "Delivered publication (event-instance-\\d+) again to its reactions\\. Nothing new was published\\.",
  );
  if (replayed !== "event-instance-1")
    throw new Error(`Replay named ${replayed}, not the publication that was replayed.`);
  tree = await snapshot();
  await run("click", reference(tree, 'button "Cancel delivery delivery-3"'));
  await confirm(driver, "Cancel delivery delivery-3?", "Cancel delivery");
  await run("wait", "--text", "Cancelled delivery delivery-3.");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Retry delivery delivery-dead-letter-1"'));
  await confirm(driver, "Retry delivery delivery-dead-letter-1?", "Retry");
  await run("wait", "--text", "Retried delivery delivery-dead-letter-1.");
  includes(await run("eval", "document.body.innerText.includes('delivery-2')"), "true");
}

/** Answers the confirmation step an event action asks before it runs. */
async function confirm(driver: BrowserAcceptanceDriver, title: string, label: string) {
  await driver.run("wait", "--text", title);
  await driver.run("click", driver.reference(await driver.snapshot(), `button "${label}"`));
  await driver.run("wait", "--fn", "!document.querySelector('dialog[open]')");
}

/** Waits for an action's result sentence and checks the publication it names is in the list.
 * @param pattern - Regular expression source whose first group is the new publication id.
 * @returns The new publication id.
 */
async function publicationNamedBy(driver: BrowserAcceptanceDriver, pattern: string) {
  const find = `document.body.innerText.match(new RegExp(${JSON.stringify(pattern)}))?.[1]`;
  await driver.run("wait", "--fn", `Boolean(${find})`);
  const named = (await driver.run("eval", find)).match(/event-instance-\d+/)?.[0];
  if (named === undefined) throw new Error(`No result sentence matched ${pattern}`);
  const listed = `document.querySelector('[aria-label="Publications"]')?.textContent?.includes(${JSON.stringify(named)})`;
  driver.includes(await driver.run("eval", `Boolean(${listed})`), "true");
  return named;
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
