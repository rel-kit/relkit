import { expect, test } from "bun:test";
import { jobsIdentityHeaders } from "./src/commands/jobs-request.js";
import { parseEffectCli } from "./src/cli-effect-runtime.js";

test("Jobs CLI forwards the backend identity and visitor cookies to RPC", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    expect(String(input).endsWith("/_relkit/v1/client/identity")).toBe(true);
    const headers = new Headers();
    headers.append("set-cookie", "relkit_visitor=visitor-1; Path=/; HttpOnly");
    headers.append("set-cookie", "relkit_csrf=csrf-1; Path=/");
    return new Response(
      JSON.stringify({
        identityScope: "scope-1",
        sessionEpoch: "epoch-1",
        publicFingerprint: "sha256:contract-1",
      }),
      { headers },
    );
  }) as typeof fetch;
  try {
    expect(await jobsIdentityHeaders()).toEqual({
      "x-relkit-identity-scope": "scope-1",
      "x-relkit-session-epoch": "epoch-1",
      "x-relkit-public-fingerprint": "sha256:contract-1",
      cookie: "relkit_visitor=visitor-1; relkit_csrf=csrf-1",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Jobs run flags reach the handler with kebab-case names", async () => {
  const parsed = await parseEffectCli(["jobs", "runs", "get", "--run-id", "run-1"], "test");
  expect(parsed.invocation).toEqual({
    command: "jobs",
    args: ["runs", "get", "--run-id", "run-1"],
  });
});
