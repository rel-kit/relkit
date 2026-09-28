import { expect, test } from "vitest";
import { z } from "@relkit/schema";
import { Effect, Layer, Result } from "effect";
import {
  assertOptionsEffect,
  ClientUtilityFailure,
  normalizeResultEffect,
  parseInputEffect,
  resolveProviderEffect,
} from "../src/client-utils.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";
test("client helpers expose typed validation failures and observed Effect paths", async () => {
  const seen: string[] = [];
  const layer = Layer.succeed(
    JobsTelemetry,
    JobsTelemetry.of({
      observe: (operation, effect) => {
        seen.push(operation);
        return effect;
      },
    }),
  );
  const provider = { enqueue: async () => ({ instanceId: "one", accepted: true as const }) };
  expect(
    Effect.runSync(Effect.provide(resolveProviderEffect(provider, "default", undefined), layer)),
  ).toBe(provider);
  expect(
    await Effect.runPromise(Effect.provide(parseInputEffect(z.string(), "value"), layer)),
  ).toBe("value");
  expect(
    Effect.runSync(
      Effect.provide(
        normalizeResultEffect({ instanceId: "one", accepted: true }, "default", undefined),
        layer,
      ),
    ),
  ).toMatchObject({ instanceId: "one", accepted: true });
  const invalid = Effect.runSync(Effect.result(Effect.provide(assertOptionsEffect(null), layer)));
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure).toBeInstanceOf(ClientUtilityFailure);
  expect(seen).toEqual([
    "client.resolveProvider",
    "client.parseInput",
    "client.normalizeResult",
    "client.assertOptions",
  ]);
});
