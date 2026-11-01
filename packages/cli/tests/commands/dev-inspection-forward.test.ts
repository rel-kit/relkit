/** Verifies inspector traffic reaches the application as a same-origin call to its public listener. */
import { expect, test } from "bun:test";
import {
  firstPartyInspectionRequest,
  inspectionOrigins,
} from "../../src/commands/dev-inspection-forward.js";

test("mutations carry the public origin, URL and body instead of the bridge authority", async () => {
  const request = new Request("http://127.0.0.1:9911/api/auth/sign-in/email?next=1", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: "session=1",
      referer: "http://127.0.0.1:3210/scalar",
      "sec-fetch-mode": "cors",
    },
    body: JSON.stringify({ email: "a@example.com" }),
  });

  const forwarded = firstPartyInspectionRequest(request, "http://127.0.0.1:3000");

  expect(forwarded.url).toBe("http://127.0.0.1:3000/api/auth/sign-in/email?next=1");
  expect(forwarded.method).toBe("POST");
  expect(forwarded.headers.get("origin")).toBe("http://127.0.0.1:3000");
  expect(forwarded.headers.has("referer")).toBe(false);
  expect(forwarded.headers.get("cookie")).toBe("session=1");
  expect(await forwarded.json()).toEqual({ email: "a@example.com" });
});

test("a browser origin that reached the bridge is replaced, not trusted", () => {
  const request = new Request("http://127.0.0.1:9911/orders", {
    headers: { origin: "http://evil.example" },
  });

  const forwarded = firstPartyInspectionRequest(request, "http://127.0.0.1:3005");

  expect(forwarded.headers.get("origin")).toBe("http://127.0.0.1:3005");
  expect(forwarded.body).toBeNull();
});

test("the Origin follows the app's own loopback BETTER_AUTH_URL", () => {
  const session = { backendPort: 3000, options: {} } as Parameters<typeof inspectionOrigins>[0];
  const bound = { listener: "http://127.0.0.1:3000", origin: "http://127.0.0.1:3000" };

  expect(inspectionOrigins(session, { BETTER_AUTH_URL: "http://localhost:3000/api/auth" })).toEqual(
    { listener: "http://localhost:3000", origin: "http://localhost:3000" },
  );
  // A frontend served on another port stays the trusted Origin; the request still reaches the listener.
  expect(inspectionOrigins(session, { BETTER_AUTH_URL: "http://localhost:4000" })).toEqual({
    listener: "http://127.0.0.1:3000",
    origin: "http://localhost:4000",
  });
  expect(inspectionOrigins(session, {})).toEqual(bound);
  expect(inspectionOrigins(session, { BETTER_AUTH_URL: "https://app.example.com" })).toEqual(bound);
  expect(inspectionOrigins(session, { BETTER_AUTH_URL: "not a url" })).toEqual(bound);
});

test("a split frontend Origin is sent while the URL and Host stay on the listener", () => {
  const forwarded = firstPartyInspectionRequest(
    new Request("http://127.0.0.1:9911/api/auth/sign-in/email", { method: "POST" }),
    "http://127.0.0.1:3000",
    "http://localhost:4000",
  );

  expect(forwarded.url).toBe("http://127.0.0.1:3000/api/auth/sign-in/email");
  expect(forwarded.headers.get("origin")).toBe("http://localhost:4000");
});

test("wildcard binds use loopback and IPv6 hosts are bracketed once", () => {
  const at = (hostname: string) =>
    inspectionOrigins(
      { backendPort: 3000, options: { hostname } } as Parameters<typeof inspectionOrigins>[0],
      {},
    ).listener;

  expect(at("0.0.0.0")).toBe("http://127.0.0.1:3000");
  expect(at("::1")).toBe("http://[::1]:3000");
  expect(at("[::1]")).toBe("http://[::1]:3000");
});
