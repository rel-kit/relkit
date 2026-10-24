/** Preserves the original bucket pagination, preview policy and cache UI assertions.
 * Scenarios share one browser driver and run in their established sequence.
 */
import type { BrowserAcceptanceDriver } from "./test-inspector-agent-browser.js";

/** Runs the established resource UI scenarios.
 * @param driver - Existing owned browser session and assertion helpers.
 * @returns Completion after every original action and assertion.
 */
export async function runResourceBrowserAcceptance(driver: BrowserAcceptanceDriver): Promise<void> {
  await bucketPagination(driver);
  await jsonPreview(driver);
  await imagePreview(driver);
  await pdfPreview(driver);
  await metadataPreviews(driver);
  await cachePreview(driver);
}

async function bucketPagination(driver: BrowserAcceptanceDriver): Promise<void> {
  const { baseUrl, run, snapshot, reference, includes } = driver;
  await run("open", `${baseUrl}/buckets/assets`);
  await run("wait", "--text", "docs/readme.txt");
  let tree = await snapshot();
  includes(tree, 'textbox "Object key prefix"');
  includes(tree, 'cell "docs/readme.txt"');
  includes(tree, 'button "Next"');
  await run("click", reference(tree, 'button "Next"'));
  await run("wait", "--text", "Page 2");
  tree = await snapshot();
  includes(tree, 'button "Previous"');
  await run("click", reference(tree, 'button "Previous"'));
  await run("wait", "--text", "docs/readme.txt");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Preview"'));
  await run("wait", "--text", "Hello from the bucket inspector.");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Close dialog"'));
  await run("wait", "--fn", "!document.querySelector('.overlay-dialog-backdrop')");
}

async function jsonPreview(driver: BrowserAcceptanceDriver): Promise<void> {
  const { run, snapshot, reference } = driver;
  let tree = await snapshot();
  await run("fill", reference(tree, 'textbox "Object key prefix"'), "docs/config.json");
  await run("click", reference(tree, 'button "Search"'));
  await run("wait", "--text", "docs/config.json");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Preview"'));
  await run("wait", "--text", '{"enabled":true}');
  await run("press", "Escape");
  await run("wait", "--fn", "!document.querySelector('.overlay-dialog-backdrop')");
}

async function imagePreview(driver: BrowserAcceptanceDriver): Promise<void> {
  const { baseUrl, run, snapshot, reference, includes } = driver;
  await run("open", `${baseUrl}/buckets/assets`);
  await run("wait", "--text", "docs/readme.txt");
  let tree = await snapshot();
  await run("fill", reference(tree, 'textbox "Object key prefix"'), "images/");
  await run("click", reference(tree, 'button "Search"'));
  await run("wait", "--text", "images/pixel.png");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Preview"'));
  await run("wait", 'img[alt="Preview of images/pixel.png"]');
  includes(
    await run(
      "eval",
      "Boolean(document.querySelector('img[alt=\"Preview of images/pixel.png\"]'))",
    ),
    "true",
  );
  await run("press", "Escape");
  await run("wait", "--fn", "!document.querySelector('.overlay-dialog-backdrop')");
}

async function pdfPreview(driver: BrowserAcceptanceDriver): Promise<void> {
  const { baseUrl, run, snapshot, reference, includes } = driver;
  await run("open", `${baseUrl}/buckets/assets`);
  await run("wait", "--text", "docs/readme.txt");
  let tree = await snapshot();
  await run("fill", reference(tree, 'textbox "Object key prefix"'), "documents/");
  await run("click", reference(tree, 'button "Search"'));
  await run("wait", "--text", "documents/sample.pdf");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Preview"'));
  await run("wait", 'iframe[title="Preview of documents/sample.pdf"][sandbox]');
  includes(
    await run(
      "eval",
      "Boolean(document.querySelector('iframe[title=\"Preview of documents/sample.pdf\"][sandbox]'))",
    ),
    "true",
  );
  await run("press", "Escape");
  await run("wait", "--fn", "!document.querySelector('.overlay-dialog-backdrop')");
}

async function metadataPreviews(driver: BrowserAcceptanceDriver): Promise<void> {
  const { baseUrl, run, snapshot, reference, includes } = driver;
  let tree = await snapshot();
  await run("fill", reference(tree, 'textbox "Object key prefix"'), "unsafe/");
  await run("click", reference(tree, 'button "Search"'));
  await run("wait", "--text", "unsafe/page.html");
  tree = await snapshot();
  includes(tree, 'cell "unsafe/page.html"');
  await run("click", reference(tree, 'button "Preview"'));
  await run("wait", "--text", "metadata-only");
  await run("open", `${baseUrl}/buckets/assets`);
  await run("wait", "--text", "docs/readme.txt");
  tree = await snapshot();
  await run("fill", reference(tree, 'textbox "Object key prefix"'), "binary/oversized.bin");
  await run("click", reference(tree, 'button "Search"'));
  await run("wait", "--text", "binary/oversized.bin");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Preview"'));
  await run("wait", "--text", "metadata-only");
  await run("open", `${baseUrl}/buckets/assets`);
  await run("wait", "--text", "docs/readme.txt");
  tree = await snapshot();
  await run("fill", reference(tree, 'textbox "Object key prefix"'), "does-not-exist/");
  await run("click", reference(tree, 'button "Search"'));
  await run("wait", "--text", "No objects found.");
  await run("open", `${baseUrl}/buckets/archive`);
  await run("wait", "--text", "does not support inspection");
  await run("open", `${baseUrl}/buckets/broken`);
  await run("wait", "--text", "Provider explorer failed.");
}

async function cachePreview(driver: BrowserAcceptanceDriver): Promise<void> {
  const { baseUrl, run, snapshot, reference, includes } = driver;
  await run("open", `${baseUrl}/cache/prices`);
  await run("wait", "--text", "price:01");
  let tree = await snapshot();
  includes(tree, 'textbox "Cache key search"');
  includes(tree, 'cell "\\\"price:01\\\""');
  includes(tree, "12000 ms TTL");
  await run("click", reference(tree, 'button "Refresh"'));
  await run("wait", "--load", "networkidle");
  tree = await snapshot();
  await run("click", reference(tree, 'button "View value"'));
  await run("wait", "--text", '"cents": 100');
  await run("press", "Escape");
  await run("wait", "--fn", "!document.querySelector('.overlay-dialog-backdrop')");
  if ((await snapshot()).includes('button "Close dialog"'))
    throw new Error("Escape did not close the dialog");
}
