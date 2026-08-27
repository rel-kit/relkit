import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dir, "..");
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
  [process.execPath, "run", "--cwd", "apps/inspector", "dev", "--", "--port", "3210"],
  {
    cwd: root,
    env: { ...process.env, RELKIT_BACKEND_URL: "http://127.0.0.1:3212" },
    stdout: "ignore",
    stderr: "inherit",
  },
);
try {
  await waitFor("http://127.0.0.1:3210/buckets/assets");
  await run("open", "http://127.0.0.1:3210/buckets/assets");
  await run("wait", "500");
  let tree = await snapshot();
  includes(tree, 'textbox "Object key prefix"');
  includes(tree, 'cell "docs/readme.txt"');
  includes(tree, 'button "Next"');
  await run("click", reference(tree, 'button "Next"'));
  await run("wait", "300");
  tree = await snapshot();
  includes(await run("get", "text", "body"), "Page 2");
  includes(tree, 'button "Previous"');
  await run("click", reference(tree, 'button "Previous"'));
  await run("wait", "300");
  await run("click", reference(tree, 'button "Preview"'));
  await run("wait", "300");
  includes(await run("get", "text", "body"), "Hello from the bucket inspector.");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Close dialog"'));
  tree = await snapshot();
  await run("fill", reference(tree, 'textbox "Object key prefix"'), "docs/config.json");
  await run("click", reference(tree, 'button "Search"'));
  await run("wait", "300");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Preview"'));
  await run("wait", "300");
  includes(await run("get", "text", "body"), '{"enabled":true}');
  await run("press", "Escape");
  await run("open", "http://127.0.0.1:3210/buckets/assets");
  await run("wait", "300");
  tree = await snapshot();
  await run("fill", reference(tree, 'textbox "Object key prefix"'), "images/");
  await run("click", reference(tree, 'button "Search"'));
  await run("wait", "300");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Preview"'));
  await run("wait", "300");
  includes(
    await run(
      "eval",
      "Boolean(document.querySelector('img[alt=\"Preview of images/pixel.png\"]'))",
    ),
    "true",
  );
  await run("press", "Escape");
  await run("open", "http://127.0.0.1:3210/buckets/assets");
  await run("wait", "300");
  tree = await snapshot();
  await run("fill", reference(tree, 'textbox "Object key prefix"'), "documents/");
  await run("click", reference(tree, 'button "Search"'));
  await run("wait", "300");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Preview"'));
  await run("wait", "300");
  includes(
    await run(
      "eval",
      "Boolean(document.querySelector('iframe[title=\"Preview of documents/sample.pdf\"][sandbox]'))",
    ),
    "true",
  );
  await run("press", "Escape");
  tree = await snapshot();
  await run("fill", reference(tree, 'textbox "Object key prefix"'), "unsafe/");
  await run("click", reference(tree, 'button "Search"'));
  await run("wait", "300");
  tree = await snapshot();
  includes(tree, 'cell "unsafe/page.html"');
  await run("click", reference(tree, 'button "Preview"'));
  await run("wait", "300");
  includes(await run("get", "text", "body"), "metadata-only");
  await run("open", "http://127.0.0.1:3210/buckets/assets");
  await run("wait", "300");
  tree = await snapshot();
  await run("fill", reference(tree, 'textbox "Object key prefix"'), "binary/oversized.bin");
  await run("click", reference(tree, 'button "Search"'));
  await run("wait", "300");
  tree = await snapshot();
  await run("click", reference(tree, 'button "Preview"'));
  await run("wait", "300");
  includes(await run("get", "text", "body"), "metadata-only");
  await run("open", "http://127.0.0.1:3210/buckets/assets");
  await run("wait", "300");
  tree = await snapshot();
  await run("fill", reference(tree, 'textbox "Object key prefix"'), "does-not-exist/");
  await run("click", reference(tree, 'button "Search"'));
  await run("wait", "300");
  includes(await run("get", "text", "body"), "No objects found.");
  await run("open", "http://127.0.0.1:3210/buckets/archive");
  await run("wait", "300");
  includes(await run("get", "text", "body"), "does not support inspection");
  await run("open", "http://127.0.0.1:3210/buckets/broken");
  await run("wait", "17000");
  includes(await run("get", "text", "body"), "Provider explorer failed.");
  await run("open", "http://127.0.0.1:3210/cache/prices");
  await run("wait", "500");
  tree = await snapshot();
  includes(tree, 'textbox "Cache key search"');
  includes(tree, 'cell "\\\"price:01\\\""');
  includes(tree, "12000 ms TTL");
  await run("click", reference(tree, 'button "Refresh"'));
  await run("wait", "300");
  await run("click", reference(tree, 'button "View value"'));
  await run("wait", "300");
  includes(await run("get", "text", "body"), '"cents": 100');
  await run("press", "Escape");
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
