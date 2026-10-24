/** Native forwarding must never interpret a route pathname as a new origin. */
import { expect, test, vi } from "vitest";
import { Effect, Exit } from "effect";
import { InspectionNative } from "../src/connection/native.service.js";

test("a network-path reference cannot send session credentials to a foreign origin", async () => {
  const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unexpected"));
  try {
    const native = await Effect.runPromise(InspectionNative.make);
    const exit = await Effect.runPromise(
      Effect.exit(
        native.forward(
          {
            endpoint: "http://127.0.0.1:43000",
            generationId: "one",
            capabilities: [],
          },
          new Request("http://127.0.0.1:42000//foreign.invalid/route"),
        ),
      ),
    );
    expect(Exit.isFailure(exit)).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    fetcher.mockRestore();
  }
});
