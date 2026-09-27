import { describe, expect, test, vi } from "vitest";
import { Effect, Exit, Layer } from "effect";
import {
  notify,
  notifyEffect,
  resolveProvider,
  resolveProviderEffect,
  resolveValue,
  resolveValueEffect,
} from "../src/client-provider.js";
import { normalizeOptionsEffect } from "../src/client-validation.js";
import {
  EventClientValidationError,
  EventProfileError,
  EventProviderError,
} from "../src/client-errors.js";
import { EventTelemetry } from "../src/event-observability.js";

const provider = { publish: async () => ({ accepted: true as const, instanceId: "event-1" }) };

describe("provider resolution and telemetry", () => {
  test("resolves provider profiles and reports typed failures", () => {
    expect(resolveProvider(provider, "default", undefined)).toBe(provider);
    expect(resolveProvider({ default: provider }, "default", undefined)).toBe(provider);
    expect(
      resolveProvider({ capability: "events", value: { default: provider } }, "default", undefined),
    ).toBe(provider);
    expect(Effect.runSync(resolveProviderEffect({}, "default", () => provider))).toBe(provider);
    expect(() => resolveProvider({}, "missing", undefined)).toThrow(EventProfileError);
    expect(() => resolveProvider({ default: {} }, "default", undefined)).toThrow(
      EventProviderError,
    );
    expect(
      Effect.runSync(Effect.flip(resolveProviderEffect({}, "missing", undefined))),
    ).toBeInstanceOf(EventProfileError);
    const failure = Effect.runSync(
      Effect.flip(
        resolveProviderEffect({}, "default", () => {
          throw new Error("resolver offline");
        }),
      ),
    );
    expect(failure).toBeInstanceOf(EventClientValidationError);
    expect(failure.message).toBe("resolver offline");
  });

  test("keeps edge notification best effort and resolves lazy correlation IDs", () => {
    const hook = vi.fn(() => {
      throw new Error("telemetry failed");
    });
    expect(() => notify(hook, { id: "one" })).not.toThrow();
    expect(hook).toHaveBeenCalledOnce();
    notify(hook, { id: "two" }, false);
    expect(hook).toHaveBeenCalledOnce();
    expect(Effect.runSync(notifyEffect(undefined, { id: "three" }))).toBeUndefined();
    expect(Effect.runSync(resolveValueEffect(() => "correlation-1"))).toBe("correlation-1");
    expect(resolveValue("correlation-2")).toBe("correlation-2");
    expect(Effect.runSync(resolveValueEffect(undefined))).toBeUndefined();
    expect(
      Effect.runSync(
        Effect.flip(
          resolveValueEffect(() => {
            throw new Error("correlation failed");
          }),
        ),
      ),
    ).toBeInstanceOf(EventClientValidationError);
  });

  test("records success and failure through a supplied telemetry layer", () => {
    const exits: string[] = [];
    const layer = Layer.succeed(
      EventTelemetry,
      EventTelemetry.of({
        observe: (operation, effect) =>
          Effect.onExit(effect, (exit) =>
            Effect.sync(() => {
              exits.push(`${operation}:${Exit.isSuccess(exit) ? "success" : "failure"}`);
            }),
          ),
      }),
    );
    Effect.runSync(normalizeOptionsEffect({}).pipe(Effect.provide(layer)));
    Effect.runSync(Effect.flip(normalizeOptionsEffect(null).pipe(Effect.provide(layer))));
    expect(exits).toEqual(["client.normalizeOptions:success", "client.normalizeOptions:failure"]);
  });
});
