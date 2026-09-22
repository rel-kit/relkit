import { readFile } from "node:fs/promises";

const page = String.raw`<!doctype html>
<meta charset="utf-8">
<title>RELKIT job client acceptance</title>
<pre id="result">running</pre>
<script>
void import("/jobs/index.js").then(async ({ watchJobRun }) => {
const result = document.querySelector("#result");
const waitFor = async (check) => {
  for (let index = 0; index < 100; index += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("browser job watch did not settle");
};
const iteratorFromResponse = async (response) => {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    async next() {
      while (true) {
        const newline = buffer.indexOf("\n");
        if (newline >= 0) {
          const value = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          if (value) return { done: false, value: JSON.parse(value) };
        }
        const chunk = await reader.read();
        if (chunk.done) {
          if (!buffer) return { done: true, value: undefined };
          const value = buffer;
          buffer = "";
          return { done: false, value: JSON.parse(value) };
        }
        buffer += decoder.decode(chunk.value, { stream: true });
      }
    },
    return: async () => {
      await reader.cancel();
      return { done: true, value: undefined };
    },
  };
};
const client = {
  jobs: {
    exports: {
      runs: {
        watch: async (input) => iteratorFromResponse(await fetch("/fixture/watch?runId=" + input.runId)),
        get: async (input, options) => (await fetch("/fixture/get?runId=" + input.runId, { signal: options?.signal })).json(),
      },
    },
  },
};
const connections = [];
const native = watchJobRun(client, "exports", { runId: "browser-native", readTimeoutMs: 1_000 });
native.subscribe((state) => connections.push(state.connection));
await native.connect();
await waitFor(() => native.getSnapshot().connection === "completed");
const nativeState = native.getSnapshot();
await native.dispose();
const polling = watchJobRun(client, "exports", { runId: "browser-polling", source: "polling", readTimeoutMs: 1_000 });
await polling.connect();
const pollingState = polling.getSnapshot();
await polling.dispose();
const metrics = await (await fetch("/metrics")).json();
const output = {
  native: { connection: nativeState.connection, run: nativeState.run?.status, source: nativeState.source },
  polling: { connection: pollingState.connection, run: pollingState.run?.status, source: pollingState.source },
  connections,
  metrics: { ...metrics, browserHeap: performance.memory?.usedJSHeapSize ?? null },
};
const passed = output.native.connection === "completed" && output.polling.connection === "completed" && output.metrics.activeWatches === 0 && output.metrics.pollingReads === 2;
result.textContent = JSON.stringify({ passed, ...output }, null, 2);
await fetch("/shutdown?passed=" + passed);
}).catch(async (error) => {
const errorOutput = document.querySelector("#result");
if (errorOutput) errorOutput.textContent = String(error?.stack || error);
await fetch("/shutdown?passed=false");
});
`;

const clientRoot = new URL("../../../packages/client/dist/jobs/", import.meta.url);
let activeWatches = 0;
let watchCalls = 0;
let nativeReads = 0;
let pollingReads = 0;
let frameBytes = 0;
let passed = false;
let finish!: () => void;
const done = new Promise<void>((resolve) => (finish = resolve));
const rssBefore = process.memoryUsage().rss;
const cpuBefore = process.cpuUsage();
const run = (runId: string, status: "running" | "completed") => ({
  accepted: true,
  runId,
  jobId: "jobs.exports",
  taskId: "exports",
  taskVersion: "1",
  acceptedAt: new Date().toISOString(),
  buildId: "browser-fixture",
  service: "browser-fixture",
  status,
  observedAt: new Date().toISOString(),
  resultAvailability: status === "completed" ? "available" : "pending",
  ...(status === "completed" ? { output: { ok: true } } : {}),
});
const response = (body: BodyInit, type = "application/json") =>
  new Response(body, { headers: { "content-type": type } });
const server = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/") return response(page, "text/html");
    if (url.pathname.startsWith("/jobs/")) {
      const file = url.pathname.slice("/jobs/".length);
      if (!file || file.includes("..")) return new Response("not found", { status: 404 });
      return new Response(await Bun.file(new URL(file, clientRoot)).arrayBuffer(), {
        headers: { "content-type": "text/javascript" },
      });
    }
    if (url.pathname === "/fixture/watch") {
      watchCalls += 1;
      activeWatches += 1;
      const runId = url.searchParams.get("runId") ?? "browser-native";
      const status = runId === "browser-native" ? "completed" : "running";
      const encoded = new TextEncoder().encode(
        JSON.stringify({
          kind: "update",
          run: run(runId, status),
          observedAt: new Date().toISOString(),
          epoch: "browser-epoch",
          sequence: 1,
          cursor: "browser-cursor",
        }) + "\n",
      );
      frameBytes += encoded.byteLength;
      let settled = false;
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoded);
            settled = true;
            activeWatches -= 1;
            controller.close();
          },
          cancel() {
            if (settled) return;
            settled = true;
            activeWatches -= 1;
          },
        }),
        { headers: { "content-type": "application/x-ndjson" } },
      );
    }
    if (url.pathname === "/fixture/get") {
      if (url.searchParams.get("runId") === "browser-polling") pollingReads += 1;
      else nativeReads += 1;
      return response(JSON.stringify(run(url.searchParams.get("runId") ?? "unknown", "completed")));
    }
    if (url.pathname === "/metrics") {
      return response(
        JSON.stringify({ activeWatches, watchCalls, nativeReads, pollingReads, frameBytes }),
      );
    }
    if (url.pathname === "/shutdown") {
      passed = url.searchParams.get("passed") === "true";
      setTimeout(finish, 10);
      return response("ok", "text/plain");
    }
    return new Response("not found", { status: 404 });
  },
});
console.log(`CLIENT_BROWSER_URL=http://127.0.0.1:${server.port}/`);
await done;
server.stop(true);
const cpuAfter = process.cpuUsage(cpuBefore);
console.log(
  JSON.stringify({
    passed,
    rssBefore,
    rssAfter: process.memoryUsage().rss,
    cpuUserMicros: cpuAfter.user,
    cpuSystemMicros: cpuAfter.system,
    watchCalls,
    nativeReads,
    pollingReads,
    frameBytes,
  }),
);
if (!passed) process.exitCode = 1;
