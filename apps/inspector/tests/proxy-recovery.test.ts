/** Exercises unavailable/recovered loopback upstreams without retrying mutations or weakening origin checks. */
import { afterEach, expect, test } from "bun:test";
import { POST } from "../app/%5Frelkit/backend/[...path]/route";

const previous = process.env.RELKIT_BACKEND_URL;
let backend: ReturnType<typeof Bun.serve> | undefined;

afterEach(async () => {
  await backend?.stop(true);
  backend = undefined;
  if (previous === undefined) delete process.env.RELKIT_BACKEND_URL;
  else process.env.RELKIT_BACKEND_URL = previous;
});

/** @param origin - Browser origin. @returns A single mutation with a generation identity. */
function request(origin = "http://127.0.0.1:3210") {
  return new Request("http://127.0.0.1:3210/_relkit/backend/echo", {
    method: "POST",
    headers: { origin, "content-type": "application/json", "x-relkit-generation-id": "one" },
    body: JSON.stringify({ message: "owned-probe" }),
  });
}

test("unavailable upstream yields safe JSON and later requests recover without replay", async () => {
  backend = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({}) });
  const port = backend.port;
  process.env.RELKIT_BACKEND_URL = `http://127.0.0.1:${port}`;
  await backend.stop(true);
  const context = { params: Promise.resolve({ path: ["echo"] }) };
  const unavailable = await POST(request(), context);
  expect(unavailable.status).toBe(503);
  expect(unavailable.headers.get("content-type")).toContain("application/json");
  expect(unavailable.headers.get("cache-control")).toBe("no-store");
  expect(await unavailable.json()).toEqual({ error: "RELKIT inspector backend is unavailable." });
  let calls = 0;
  backend = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: async (incoming) => {
      calls++;
      expect(incoming.headers.get("x-relkit-generation-id")).toBe("one");
      return Response.json(await incoming.json());
    },
  });
  const denied = await POST(request("https://foreign.invalid"), context);
  expect(denied.status).toBe(403);
  expect(calls).toBe(0);
  const recovered = await POST(request(), context);
  expect(recovered.status).toBe(200);
  expect(await recovered.json()).toEqual({ message: "owned-probe" });
  expect(calls).toBe(1);
});
