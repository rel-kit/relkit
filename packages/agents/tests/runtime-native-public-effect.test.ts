import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect } from "effect";
import { expect, test } from "vitest";
import { nativePublicEventEffect, publicToolValueEffect } from "../src/runtime-native-public.js";
import { selectEffect } from "../src/runtime-native-public-state.js";
import { native } from "./native-deep-events.helpers.js";

test("public native event Effects project safe tool values", async () => {
  const event = await Effect.runPromise(
    nativePublicEventEffect(
      native(0, "tools", [], { event: "tool-finished", output: '{"ok":true}' }),
      new Map(),
    ),
  );
  expect(event.value).toEqual({ event: "tool-finished", output: { ok: true } });
  expect(Effect.runSync(publicToolValueEffect('{"ok":true}'))).toEqual({ ok: true });
});

test("public state validation caps concurrent schema work at eight and retains key order", async () => {
  let active = 0;
  let peak = 0;
  let started = 0;
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const firstBatch = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const schema = {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: async (value: unknown) => {
        active += 1;
        peak = Math.max(peak, active);
        started += 1;
        if (started === 8) reached();
        await gate;
        active -= 1;
        return { value };
      },
    },
  } as StandardSchemaV1;
  const keys = Array.from({ length: 12 }, (_, index) => `field${index}`);
  const schemas = new Map(keys.map((key) => [key, schema]));
  const value = Object.fromEntries(keys.map((key) => [key, key]));
  const running = Effect.runPromise(selectEffect(value, schemas));
  await firstBatch;
  expect(peak).toBe(8);
  release();
  expect(Object.keys(await running)).toEqual(keys);
  expect(peak).toBe(8);
});
