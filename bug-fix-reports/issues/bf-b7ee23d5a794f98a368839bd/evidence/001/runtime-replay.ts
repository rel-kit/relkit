import { strict as assert } from "node:assert";
import { join } from "node:path";

// Supply the scratch project path when replaying outside the original local setup.
const root =
  process.argv[2] ?? (await Bun.file(join(import.meta.dir, "project-root.txt")).text()).trim();
assert.throws(() => Bun.resolveSync("deepagents", root));
async function freePort() {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const port = probe.port!;
  await probe.stop(true);
  return port;
}
const port = await freePort();
const inspector = await freePort();
const child = Bun.spawn(
  [
    process.execPath,
    join(root, "cli/dist/index.js"),
    "dev",
    "--project-root",
    root,
    "--port",
    String(port),
    "--inspector-port",
    String(inspector),
    "--no-color",
  ],
  { cwd: root, env: { ...process.env, PORT: String(port) }, stdout: "pipe", stderr: "pipe" },
);
const logs = Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
try {
  let ready = false;
  for (let attempt = 0; attempt < 600; attempt++) {
    assert.equal(child.exitCode, null, "CLI exited before serving the greeting");
    const response = await fetch(`http://127.0.0.1:${port}/hello?name=RelKit`, {
      signal: AbortSignal.timeout(1_000),
    }).catch(() => undefined);
    if (response?.ok) {
      assert.deepEqual(await response.json(), { message: "Hello, RelKit!" });
      ready = true;
      break;
    }
    await Bun.sleep(100);
  }
  assert.ok(ready, "Greeting route did not become available");
  console.log("PASS: development greeting is Hello, RelKit! without DeepAgents installed");
  const graph = await (await fetch(`http://127.0.0.1:${port}/_relkit/v1/graph`)).json();
  assert.match(graph.graphHash, /^sha256:/);
  assert.ok(graph.graph.nodes.some((node: { kind: string }) => node.kind === "agent"));
  console.log("PASS: graph contains ordinary agent descriptors");
  const openapi = await (await fetch(`http://127.0.0.1:${port}/_relkit/v1/openapi.json`)).json();
  assert.ok(openapi.paths["/hello"]);
  console.log("PASS: OpenAPI describes the greeting route");
  const invalid = await fetch(`http://127.0.0.1:${port}/hello?name=`);
  assert.equal(invalid.status, 422);
  console.log("PASS: empty name still fails route validation");
} finally {
  if (child.exitCode === null) child.kill("SIGTERM");
  await Promise.race([child.exited, Bun.sleep(5_000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
  const code = await child.exited;
  const output = (await logs).join("\n");
  console.log(output);
  assert.ok(code === 0 || code === 143, "Development server did not shut down cleanly");
  console.log("PASS: clean shutdown");
}
