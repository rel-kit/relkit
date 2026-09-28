import { expect, test } from "vitest";
import { Effect } from "effect";
import { z } from "@relkit/schema";
import {
  isRecord as isClientRecord,
  isRecordEffect as isClientRecordEffect,
} from "../src/client-record.js";
import {
  hasOwn,
  hasOwnEffect,
  isPositiveInteger,
  isPositiveIntegerEffect,
  isRecord,
  isRecordEffect,
  isSchema,
  isSchemaEffect,
  validateVersion,
  validateVersionEffect,
} from "../src/event-contract-shape.js";
import { EventDefinitionError } from "../src/event-errors.js";

test("runs descriptor shape predicates through Effect and synchronous adapters", () => {
  const schema = z.object({ id: z.string() });
  expect(isSchema(schema)).toBe(true);
  expect(Effect.runSync(isSchemaEffect({}))).toBe(false);
  expect(isRecord({ id: "one" })).toBe(true);
  expect(Effect.runSync(isRecordEffect([]))).toBe(false);
  expect(hasOwn({ id: "one" }, "id")).toBe(true);
  expect(Effect.runSync(hasOwnEffect({}, "id"))).toBe(false);
  expect(isPositiveInteger(1)).toBe(true);
  expect(Effect.runSync(isPositiveIntegerEffect(0))).toBe(false);
  expect(isClientRecord({ id: "one" })).toBe(true);
  expect(Effect.runSync(isClientRecordEffect(null))).toBe(false);
  validateVersion(1);
  expect(Effect.runSync(validateVersionEffect(2))).toBe(2);
  expect(() => validateVersion(0)).toThrow(TypeError);
  expect(Effect.runSync(Effect.flip(validateVersionEffect(0)))).toBeInstanceOf(
    EventDefinitionError,
  );
});
