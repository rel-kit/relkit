/** Exercises moved history views and an existing generation-bound job control. */
import type { BrowserAcceptanceDriver } from "./test-inspector-agent-browser.js";

export async function runHistoryBrowserAcceptance(driver: BrowserAcceptanceDriver): Promise<void> {
  await historyViews(driver);
  await jobControl(driver);
}

async function historyViews(driver: BrowserAcceptanceDriver): Promise<void> {
  const { baseUrl, run, snapshot, reference, includes } = driver;
  await run("set", "viewport", "1280", "900");
  await run("open", `${baseUrl}/logs`);
  await run("wait", "--text", "Initial fixture request recorded.");
  await run("click", reference(await snapshot(), 'button "Initial fixture request recorded."'));
  await run("wait", '[aria-label="Log details"]');
  includes(
    await run("eval", "!document.body.innerText.includes('sk-live-fixture-secret')"),
    "true",
  );
  await run("open", `${baseUrl}/requests/request-initial`);
  await run("wait", "--text", "Request detail");
  await run("wait", "--text", "Initial fixture request recorded.");
  await run("wait", "--text", "Correlated trace:");
  await run("open", `${baseUrl}/traces/11111111111111111111111111111111`);
  await run("wait", "--text", "Trace detail");
  await run("wait", "--text", "Initial fixture request recorded.");
  includes(await run("eval", "document.body.innerText.includes('orders.create')"), "true");
  await run("wait", "--text", "History collection connected");
}

async function jobControl(driver: BrowserAcceptanceDriver): Promise<void> {
  const { baseUrl, run, snapshot, reference } = driver;
  await run("open", `${baseUrl}/jobs/receipts.send-job`);
  await run("wait", "--text", "dead-lettered");
  await run("click", reference(await snapshot(), 'button "Retry dead letter"'));
  await run("click", reference(await snapshot(), 'button "Retry job"'));
  await run("wait", "--text", "available");
}
