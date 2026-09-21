import { expect, test } from "bun:test";
import { waitForInngestReadiness } from "./src/local-readiness.ts";

test("waits through transient worker readiness failures", async () => {
  const endpoints: string[] = [];
  const redirects: RequestInit["redirect"][] = [];
  let workerChecks = 0;
  const fetcher: typeof globalThis.fetch = async (input, init) => {
    const endpoint = String(input);
    endpoints.push(endpoint);
    redirects.push(init?.redirect);
    if (endpoint.includes("/health/ready")) {
      workerChecks += 1;
      if (workerChecks === 1) return new Response("warming", { status: 503 });
    }
    return Response.json({ ok: true });
  };

  await waitForInngestReadiness({
    ports: { api: 8288, "worker.api": 3000 },
    secrets: { signingKey: "signkey-test-abcdef" },
    fetch: fetcher,
  });

  expect(workerChecks).toBe(2);
  expect(endpoints).toEqual([
    "http://127.0.0.1:8288/v2/runs?limit=1",
    "http://127.0.0.1:3000/_relkit/v1/health/ready",
    "http://127.0.0.1:3000/_relkit/v1/health/ready",
    "http://127.0.0.1:8288/health",
  ]);
  expect(redirects).toEqual(["error", "error", "error", "error"]);
});
