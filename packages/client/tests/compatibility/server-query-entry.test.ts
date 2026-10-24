/**
 * Exercises the opt-in public Bun hydration entrypoint with native query-core.
 * The borrowed fetch adapter is restored after each case, and each query client
 * is cleared so the suite leaves no retry timers or cached work running.
 */
import { expect, test } from "bun:test";
import { QueryClient } from "@tanstack/query-core";
import type { ClientIdentityDocument } from "@relkit/contracts";
import { createRelkitServerContext } from "@relkit/client/server/tanstack-query";
import { createTanstackQueryUtils } from "@relkit/client/tanstack-query";
import { mockFetch } from "../fixtures/fetch.ts";

test("public server query entry preserves identity and native dehydrated query data", async () => {
  const original = globalThis.fetch;
  const queryClient = new QueryClient();
  const identity: ClientIdentityDocument = {
    protocol: "relkit.client-identity",
    version: 1,
    applicationId: "isolation",
    identityScope: "tenant:one",
    sessionEpoch: "epoch:one",
    publicFingerprint: "contract:one",
    issuedAt: "2026-10-21T00:00:00.000Z",
  };
  globalThis.fetch = mockFetch(async (_input, init) => {
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer current");
    expect(new Headers(init?.headers).get("x-unrelated")).toBeNull();
    return Response.json(identity);
  });
  try {
    queryClient.setQueryData(["ping"], { greeting: "hello" });
    const context = await createRelkitServerContext({
      baseUrl: "https://api.example.test",
      request: new Request("https://app.example.test", {
        headers: { authorization: "Bearer current", "x-unrelated": "private" },
      }),
      queryClient,
    });
    expect(context.identity).toEqual(identity);
    expect(context.dehydrate().scope.identityScope).toBe("tenant:one");
    expect(context.dehydrate().dehydrated.queries[0]?.state.data).toEqual({ greeting: "hello" });
    expect(typeof createTanstackQueryUtils(context.client)).toBe("object");
  } finally {
    globalThis.fetch = original;
    queryClient.clear();
  }
});

test("public server query entry preserves identity-fetch failures", async () => {
  const original = globalThis.fetch;
  const queryClient = new QueryClient();
  globalThis.fetch = mockFetch(async () => new Response(null, { status: 401 }));
  try {
    await expect(
      createRelkitServerContext({
        baseUrl: "https://api.example.test",
        request: new Request("https://app.example.test"),
        queryClient,
      }),
    ).rejects.toThrow("Relkit identity request failed (401)");
  } finally {
    globalThis.fetch = original;
    queryClient.clear();
  }
});
