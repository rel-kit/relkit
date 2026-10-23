/** Checks the real HTTP contract for SDK-free default scaffolds and rejects accidental UI exposure. */
import { expect, test } from "bun:test";
import { Effect } from "effect";
import { verifyScaffoldDevContracts } from "../../scripts/scaffold-dev-contracts.js";

for (const scalar of [false, true]) {
  test(`default scaffold ${scalar ? "rejects exposed" : "accepts absent"} Scalar UI`, async () => {
    const requested: string[] = [];
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        requested.push(path);
        if (path === "/_relkit/v1/api-reference")
          return new Response(scalar ? "Scalar" : "Not Found", { status: scalar ? 200 : 404 });
        if (path === "/hello") return Response.json({ message: "Hello, RelKit!" });
        if (path === "/_relkit/v1/openapi.json") return Response.json({ openapi: "3.1.0" });
        return Response.json({ graphHash: "fixture" });
      },
    });
    try {
      const result = Effect.runPromise(verifyScaffoldDevContracts(server.port, server.port, false));
      if (scalar) await expect(result).rejects.toThrow();
      else await result;
      expect(requested).toEqual([
        "/hello",
        "/_relkit/v1/graph",
        "/_relkit/backend/_relkit/v1/graph",
        "/_relkit/v1/openapi.json",
        "/_relkit/v1/api-reference",
      ]);
    } finally {
      await server.stop(true);
    }
  });
}
