import { expect, test } from "bun:test";
import { inspectorAddressFromEnv } from "./backend-proxy-address";
import { secureApplicationProxyHeaders } from "./backend-proxy-security";

const own = inspectorAddressFromEnv({ HOSTNAME: "127.0.0.1", PORT: "3210" });

function post(url: string, headers: Record<string, string>): Request {
  return new Request(url, { method: "POST", headers });
}

test("application proxy admits same-origin writes and strips browser provenance", () => {
  const accepted = secureApplicationProxyHeaders(
    post("http://127.0.0.1:3210/_relkit/backend/rpc", { origin: "http://127.0.0.1:3210" }),
    own,
  );
  expect(accepted.get("origin")).toBeNull();
  expect(accepted.get("referer")).toBeNull();
  const refererAccepted = secureApplicationProxyHeaders(
    post("http://127.0.0.1:3210/_relkit/backend/rpc", {
      referer: "http://127.0.0.1:3210/agents/support.order/chat",
    }),
    own,
  );
  expect(refererAccepted.get("origin")).toBeNull();
  const rewrittenUrlAccepted = secureApplicationProxyHeaders(
    post("http://localhost:3210/_relkit/backend/rpc", {
      host: "127.0.0.1:3210",
      referer: "http://127.0.0.1:3210/agents/support.order/chat",
    }),
    own,
  );
  expect(rewrittenUrlAccepted.get("origin")).toBeNull();
  expect(() =>
    secureApplicationProxyHeaders(
      post("http://127.0.0.1:3210/_relkit/backend/rpc", { origin: "https://attacker.example" }),
      own,
    ),
  ).toThrow("same-origin");
  expect(() =>
    secureApplicationProxyHeaders(post("http://127.0.0.1:3210/_relkit/backend/rpc", {}), own),
  ).toThrow("same-origin");
});

test("each loopback spelling of the Inspector's own address is accepted", () => {
  for (const origin of ["http://127.0.0.1:3210", "http://localhost:3210", "http://[::1]:3210"]) {
    const headers = secureApplicationProxyHeaders(
      post(`${origin}/_relkit/backend/rpc`, { host: new URL(origin).host, origin }),
      own,
    );
    expect(headers.get("origin")).toBeNull();
  }
});

test("a DNS-rebinding name in Host and Origin is refused for every method", () => {
  const rebound = "http://rebind.attacker.example:3210";
  const headers = { host: "rebind.attacker.example:3210", "sec-fetch-site": "same-origin" };
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "GET", "HEAD", "OPTIONS"]) {
    const reads = method === "GET" || method === "HEAD" || method === "OPTIONS";
    expect(() =>
      secureApplicationProxyHeaders(
        new Request(`${rebound}/_relkit/backend/rpc`, {
          method,
          headers: reads ? headers : { ...headers, origin: rebound },
        }),
        own,
      ),
    ).toThrow("Inspector");
  }
});

test("reads from the Inspector's own address pass without an Origin", () => {
  const headers = secureApplicationProxyHeaders(
    new Request("http://localhost:3210/_relkit/backend/status", {
      headers: { host: "localhost:3210" },
    }),
    own,
  );
  expect(headers.get("host")).toBe("localhost:3210");
});

test("another site's Origin is refused even when Host is the Inspector's own", () => {
  expect(() =>
    secureApplicationProxyHeaders(
      post("http://127.0.0.1:3210/_relkit/backend/rpc", {
        host: "127.0.0.1:3210",
        origin: "http://rebind.attacker.example:3210",
      }),
      own,
    ),
  ).toThrow("same-origin");
});
