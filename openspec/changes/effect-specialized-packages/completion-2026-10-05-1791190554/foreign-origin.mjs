import assert from "node:assert/strict";

// Select fixed destinations so this evidence probe cannot target arbitrary services.
let base;
let websocketUrl;
switch (process.env.RELKIT_ORIGIN_PROBE_URL) {
  case "http://127.0.0.1:3000":
    base = "http://127.0.0.1:3000";
    websocketUrl = "ws://127.0.0.1:3000/rpc";
    break;
  case "http://127.0.0.1:3330":
    base = "http://127.0.0.1:3330";
    websocketUrl = "ws://127.0.0.1:3330/rpc";
    break;
  default:
    throw new Error("RELKIT_ORIGIN_PROBE_URL must select a recorded local origin");
}
const graph = await (
  await fetch(`${base}/_relkit/v1/graph`, {
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  })
).json();
const functionId = graph.graph.nodes.some((node) => node.id === "hello.greet")
  ? "hello.greet"
  : "hello.hello";
const response = await fetch(`${base}/_relkit/v1/actions/functions/${functionId}/invoke`, {
  method: "POST",
  headers: { origin: "https://foreign.example", "content-type": "application/json" },
  body: JSON.stringify({
    generationId: graph.generationId,
    graphHash: graph.graphHash,
    idempotencyKey: crypto.randomUUID(),
    input: { name: "Foreign origin" },
  }),
  signal: AbortSignal.timeout(10000),
  redirect: "error",
});
const body = await response.json();
assert.equal(response.status, 403);
assert.equal(body.error.id, "ORIGIN_DENIED");
let opened = false;
let closed;
let error;
const socket = new WebSocket(websocketUrl, {
  headers: { origin: "https://foreign.example" },
});
socket.addEventListener("open", () => {
  opened = true;
});
socket.addEventListener("close", (event) => {
  closed = { code: event.code, reason: event.reason };
});
socket.addEventListener("error", (event) => {
  error = event.message;
});
await Bun.sleep(1500);
assert.equal(opened, false, "foreign-origin WebSocket must not open");
assert.notEqual(socket.readyState, WebSocket.CONNECTING, "foreign-origin socket must settle");
socket.close();
const result = {
  base,
  http: { status: response.status, id: body.error.id },
  websocket: { opened, closed, error },
};
console.log(JSON.stringify(result));
await Bun.write(
  `${process.env.RELKIT_AI_EVIDENCE_DIR}/foreign-origin-results.json`,
  JSON.stringify(result, null, 2),
);
