import { expect, test } from "bun:test";
import { secureApplicationProxyHeaders } from "./backend-proxy-security";

test("application proxy admits same-origin writes and strips browser provenance", () => {
  const accepted = secureApplicationProxyHeaders(
    new Request("http://127.0.0.1:3210/_relkit/backend/rpc", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3210" },
    }),
  );
  expect(accepted.get("origin")).toBeNull();
  expect(accepted.get("referer")).toBeNull();
  const refererAccepted = secureApplicationProxyHeaders(
    new Request("http://127.0.0.1:3210/_relkit/backend/rpc", {
      method: "POST",
      headers: { referer: "http://127.0.0.1:3210/agents/support.order/chat" },
    }),
  );
  expect(refererAccepted.get("origin")).toBeNull();
  const rewrittenUrlAccepted = secureApplicationProxyHeaders(
    new Request("http://localhost:3210/_relkit/backend/rpc", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3210",
        referer: "http://127.0.0.1:3210/agents/support.order/chat",
      },
    }),
  );
  expect(rewrittenUrlAccepted.get("origin")).toBeNull();
  expect(() =>
    secureApplicationProxyHeaders(
      new Request("http://127.0.0.1:3210/_relkit/backend/rpc", {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
    ),
  ).toThrow("same-origin");
  expect(() =>
    secureApplicationProxyHeaders(
      new Request("http://127.0.0.1:3210/_relkit/backend/rpc", { method: "POST" }),
    ),
  ).toThrow("same-origin");
});
