/** Runs the existing Inspector browser scenarios with scoped native processes and
 * per-run evidence. UI assertions remain independent from lifecycle orchestration.
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runAgentGraphAcceptance } from "./test-inspector-agent-browser.js";
import { runResourceBrowserAcceptance } from "./test-inspector-resource-browser.js";
import { withInspectorBrowser } from "./inspector-browser-runtime.js";
import { runHistoryBrowserAcceptance } from "./test-inspector-history-browser.js";

await withInspectorBrowser(async (driver, artifacts) => {
  try {
    await runHistoryBrowserAcceptance(driver);
    await runResourceBrowserAcceptance(driver);
    await runAgentGraphAcceptance(driver);
    console.log("Inspector browser acceptance passed.");
  } catch (error) {
    const tree = await driver.snapshot().catch(() => "snapshot unavailable");
    await writeFile(resolve(artifacts, "accessibility.txt"), tree);
    await driver
      .run("screenshot", resolve(artifacts, "failure.png"), "--annotate")
      .catch(() => undefined);
    throw error;
  }
});
