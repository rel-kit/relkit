import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dir, "..");
const port = Number(process.env.RELKIT_INSPECTOR_BROWSER_PORT ?? "3210");
if (!Number.isInteger(port) || port < 1 || port > 65_535)
  throw new RangeError("RELKIT_INSPECTOR_BROWSER_PORT must be a TCP port from 1 through 65535.");
const baseUrl = `http://127.0.0.1:${port}`;
const session = `relkit-inspector-${process.pid}`;
const artifacts = resolve(root, ".relkit", "inspector-browser-artifacts");
const browserEnv = {
  ...process.env,
  AGENT_BROWSER_ALLOWED_DOMAINS: "127.0.0.1",
  AGENT_BROWSER_CONTENT_BOUNDARIES: "1",
  AGENT_BROWSER_MAX_OUTPUT: "50000",
};
const fixture = Bun.spawn([process.execPath, "tests/inspector/fixture-server.ts"], {
  cwd: root,
  env: { ...process.env, RELKIT_FIXTURE_PORT: "3212" },
  stdout: "ignore",
  stderr: "inherit",
});
const inspector = Bun.spawn(
  [process.execPath, "run", "--cwd", "apps/inspector", "dev", "--", "--port", String(port)],
  {
    cwd: root,
    env: { ...process.env, RELKIT_BACKEND_URL: "http://127.0.0.1:3212" },
    stdout: "ignore",
    stderr: "inherit",
  },
);
try {
  await waitFor(`${baseUrl}/buckets/assets`);
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
  tree = await snapshot();
  await run("fill", reference(tree, 'textbox "Object key prefix"'), "docs/config.json");
  await run("click", reference(tree, 'button "Search"'));
  await run("wait", "--text", "docs/config.json");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Preview"'));
  await run("wait", "--text", '{"enabled":true}');
  await run("press", "Escape");
  await run("wait", "--fn", "!document.querySelector('.overlay-dialog-backdrop')");
  await run("open", `${baseUrl}/buckets/assets`);
  await run("wait", "--text", "docs/readme.txt");
  tree = await snapshot();
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
  await run("open", `${baseUrl}/buckets/assets`);
  await run("wait", "--text", "docs/readme.txt");
  tree = await snapshot();
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
  tree = await snapshot();
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
  await run("open", `${baseUrl}/cache/prices`);
  await run("wait", "--text", "price:01");
  tree = await snapshot();
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
  await run("set", "viewport", "390", "844");
  await run("press", "Tab");
  await run("eval", "document.activeElement?.tagName");
  console.log("Inspector browser acceptance passed.");
} catch (error) {
  await mkdir(artifacts, { recursive: true });
  const tree = await snapshot().catch(() => "snapshot unavailable");
  await writeFile(resolve(artifacts, "accessibility.txt"), tree);
  await run("screenshot", resolve(artifacts, "failure.png"), "--annotate").catch(() => undefined);
  throw error;
} finally {
  await run("close").catch(() => undefined);
  fixture.kill();
  inspector.kill();
  await Promise.allSettled([fixture.exited, inspector.exited]);
}
async function run(...args: string[]): Promise<string> {
  const child = Bun.spawn(["agent-browser", "--session", session, ...args], {
    cwd: root,
    env: browserEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, output, error] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (code !== 0)
    throw new Error(error.trim() || output.trim() || `agent-browser ${args[0]} failed`);
  return output;
}
function snapshot(): Promise<string> {
  return run("snapshot", "-i");
}
function reference(tree: string, label: string): string {
  const line = tree.split("\n").find((candidate) => candidate.includes(label));
  const value = line?.match(/ref=(e\d+)/)?.[1];
  if (value === undefined) throw new Error(`Missing accessibility reference for ${label}`);
  return `@${value}`;
}
function includes(value: string, expected: string): void {
  if (!value.includes(expected)) throw new Error(`Expected browser output to include ${expected}`);
}
async function waitFor(url: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await fetch(url).catch(() => undefined))?.ok) return;
    await Bun.sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}
