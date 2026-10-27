/** Checks the real HTTP contract for default scaffolds, which must serve the selected Scalar reference UI. */
import { expect, test } from "bun:test";
import { Effect } from "effect";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyScaffoldDevContracts } from "../../scripts/scaffold-dev-contracts.js";

for (const scalar of [false, true]) {
  test(`default scaffold ${scalar ? "accepts served" : "rejects absent"} Scalar UI`, async () => {
    const requested: string[] = [];
    const root = await mkdtemp(join(tmpdir(), "relkit-default-contract-"));
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
        if (path === "/_relkit/v1/runtime") return new Response("Not Found", { status: 404 });
        return Response.json({ graphHash: "fixture" });
      },
    });
    try {
      const result = Effect.runPromise(verifyScaffoldDevContracts(server.port, root, false));
      if (scalar) await result;
      else await expect(result).rejects.toThrow();
      expect(requested).toEqual([
        "/hello",
        "/_relkit/v1/graph",
        "/_relkit/v1/openapi.json",
        "/_relkit/v1/api-reference",
        ...(scalar ? ["/_relkit/v1/runtime"] : []),
      ]);
    } finally {
      await server.stop(true);
      await rm(root, { recursive: true, force: true });
    }
  });
}
