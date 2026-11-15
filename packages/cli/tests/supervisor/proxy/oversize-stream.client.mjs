// RK-42 client, run by Node: sends bodies over the body limit (just over, 2 MiB and 5 MiB) with
// Node's fetch (a string body) or with node:http (64 KiB chunks, declared and chunked framing in
// turn, written as the socket accepts them), each followed by a GET on a kept-alive connection.
// Prints a JSON tally: 413 `payload-too-large` answers with a request id within 5 s, how often
// each other outcome happened (by size, as status or error, `slow` past 5 s), the slowest answer,
// and how often a follow-up request was not answered 200.
import { Agent, request } from "node:http";

const [origin, mode, countText, limitText, path = "/echo", followUp = "/ok"] =
  process.argv.slice(2);
const count = Number(countText);
const limit = Number(limitText);
const sizes = [limit + 1, 2 * 1_048_576, 5 * 1_048_576];
const CHUNK = Buffer.alloc(65_536, 120);
const agent = new Agent({ keepAlive: true, maxSockets: 1 });

/** Sends one body with Node's fetch. */
async function viaFetch(size, method) {
  const response = await fetch(origin + path, {
    method,
    headers: { "content-type": "application/json", origin },
    body: "x".repeat(size),
    signal: AbortSignal.timeout(10_000),
  });
  return {
    status: response.status,
    id: response.headers.get("x-request-id"),
    text: await response.text(),
  };
}

/** Sends one body with node:http, writing chunks until the answer arrives. */
function viaHttp(size, method, declared) {
  return new Promise((resolve, reject) => {
    let answered = false;
    const outgoing = request(origin + path, {
      method,
      agent,
      headers: {
        "content-type": "application/json",
        origin,
        ...(declared ? { "content-length": String(size) } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
    outgoing.on("error", (error) => {
      if (!answered) reject(error);
    });
    outgoing.on("response", (incoming) => {
      answered = true;
      let text = "";
      incoming.setEncoding("utf8");
      incoming.on("data", (chunk) => (text += chunk));
      incoming.on("error", reject);
      incoming.on("end", () => {
        resolve({
          status: incoming.statusCode,
          id: incoming.headers["x-request-id"] ?? null,
          text,
        });
        outgoing.destroy();
      });
    });
    let sent = 0;
    const write = () => {
      while (!answered && sent < size) {
        const part = CHUNK.subarray(0, Math.min(CHUNK.length, size - sent));
        sent += part.length;
        if (!outgoing.write(part)) return void outgoing.once("drain", write);
      }
      if (!answered) outgoing.end();
    };
    write();
  });
}

/** Sends the follow-up GET on a kept-alive connection. */
async function next() {
  if (mode === "fetch") {
    const response = await fetch(origin + followUp, { signal: AbortSignal.timeout(5_000) });
    await response.arrayBuffer();
    return response.status;
  }
  return new Promise((resolve, reject) => {
    const outgoing = request(origin + followUp, { agent, signal: AbortSignal.timeout(5_000) });
    outgoing.on("error", reject);
    outgoing.on("response", (incoming) => {
      incoming.resume();
      incoming.on("end", () => resolve(incoming.statusCode));
    });
    outgoing.end();
  });
}

let ok = 0;
let slowestMs = 0;
const failures = {};
const followUpFailures = {};
const count_ = (tally, key) => (tally[key] = (tally[key] ?? 0) + 1);
for (const size of sizes)
  for (let attempt = 0; attempt < count; attempt++) {
    const method = attempt % 2 === 0 ? "POST" : "PATCH";
    const started = performance.now();
    let outcome;
    try {
      const answer =
        mode === "fetch"
          ? await viaFetch(size, method)
          : await viaHttp(size, method, attempt % 4 < 2);
      const ms = Math.round(performance.now() - started);
      slowestMs = Math.max(slowestMs, ms);
      const code = answer.status === 413 ? JSON.parse(answer.text).code : undefined;
      if (code === "payload-too-large" && answer.id && ms < 5_000) ok++;
      else outcome = `${answer.status}${answer.id ? "" : " no-id"}${ms < 5_000 ? "" : " slow"}`;
    } catch (error) {
      slowestMs = Math.max(slowestMs, Math.round(performance.now() - started));
      outcome = errorName(error);
    }
    if (outcome !== undefined) count_(failures, `${size}:${outcome}`);
    try {
      const status = await next();
      if (status !== 200) count_(followUpFailures, `${size}:${status}`);
    } catch (error) {
      count_(followUpFailures, `${size}:${errorName(error)}`);
    }
  }
agent.destroy();
console.log(JSON.stringify({ ok, failures, followUpFailures, slowestMs }));

/** Names a client error: its code, or `timeout` for the 10 s deadline. */
function errorName(error) {
  if (error?.name === "TimeoutError" || error?.cause?.name === "TimeoutError") return "timeout";
  return String(error?.cause?.code ?? error?.code ?? error?.name);
}
