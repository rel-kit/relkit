/** A stop that Bun never confirms must not hold listener retirement (and tool shutdown) forever. */
import { afterEach, expect, spyOn, test } from "bun:test";
import { Effect } from "effect";
import { InspectionNative } from "../src/connection/native.service.js";

afterEach(() => {
  (Bun.serve as unknown as { mockRestore?: () => void }).mockRestore?.();
});

test("listener retirement continues when Bun never confirms a forced stop", async () => {
  const realServe = Bun.serve.bind(Bun);
  let stopped = false;
  // Mirrors the observed failure: the socket and connections close, the promise never settles.
  spyOn(Bun, "serve").mockImplementation(((options: Parameters<typeof Bun.serve>[0]) => {
    const server = realServe(options);
    return new Proxy(server, {
      get(target, key) {
        if (key === "stop")
          return (force?: boolean) => {
            void target.stop(force);
            stopped = true;
            return new Promise<void>(() => undefined);
          };
        const value = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }) as unknown as typeof Bun.serve);

  const started = Date.now();
  const endpoint = await Effect.runPromise(
    Effect.gen(function* () {
      const native = yield* InspectionNative.make;
      const url = yield* native.listen({ host: "127.0.0.1", port: 0 }, () =>
        Effect.succeed(new Response("ok")),
      );
      const body = yield* Effect.promise(() => fetch(url).then((response) => response.text()));
      expect(body).toBe("ok");
      return url;
    }).pipe(Effect.scoped),
  );
  const elapsed = Date.now() - started;

  expect(stopped).toBe(true);
  expect(elapsed).toBeLessThan(5_000);
  await expect(fetch(endpoint)).rejects.toThrow();
});
