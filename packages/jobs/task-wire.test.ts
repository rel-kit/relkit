import { expect, test } from "bun:test";
import { z } from "@relkit/schema";
import {
  decodeJobWire,
  defineTask,
  encodeTaskInput,
  encodeTaskOutput,
  TASK_INPUT_MAX_BYTES,
  TaskWireValidationError,
  validateCanonicalInput,
  validateTaskInput,
  validateTaskOutput,
} from "./src/index.ts";

test("keeps raw handler output separate from validated canonical output", async () => {
  let transforms = 0;
  const output = z.string().transform((value) => {
    transforms += 1;
    return Number(value);
  });
  const result = await validateTaskOutput(output, "7");
  expect(result.value).toBe(7);
  expect(result.wire).toEqual({ version: 1, kind: "json", value: 7 });
  expect(transforms).toBe(1);
});

test("validates a transformed input once and replays its canonical value", async () => {
  let transforms = 0;
  const input = z.string().transform((value) => {
    transforms += 1;
    return Number(value);
  });
  const inputWire = z.number();
  const accepted = await validateTaskInput(input, "7");
  expect(accepted.value).toBe(7);
  expect(decodeJobWire(accepted.wire)).toBe(7);
  expect(await validateCanonicalInput(input, decodeJobWire(accepted.wire), inputWire)).toBe(7);
  expect(transforms).toBe(1);
});

test("rejects a changing wire validator and preserves void envelopes", async () => {
  const input = z.number();
  const changingWire = z.number().transform((value) => value + 1);
  await expect(validateCanonicalInput(input, 7, changingWire)).rejects.toMatchObject({
    code: "RELKIT_TASK_INPUT_WIRE_NON_IDENTITY",
  });
  expect(encodeTaskOutput(undefined)).toEqual({ version: 1, kind: "void" });
  expect(decodeJobWire(encodeTaskOutput(undefined))).toBeUndefined();
});

test("rejects non-JSON values, unsafe envelopes, and oversized payloads", () => {
  const accessor = Object.defineProperty({}, "value", { enumerable: true, get: () => 1 });
  const symbol = { [Symbol("secret")]: true };
  expect(() => encodeTaskInput(accessor)).toThrow(TaskWireValidationError);
  expect(() => encodeTaskInput(symbol)).toThrow(TaskWireValidationError);
  expect(() => encodeTaskInput("x".repeat(TASK_INPUT_MAX_BYTES))).toThrow("encoded bytes");
  expect(() => decodeJobWire({ version: 2, kind: "json", value: 1 })).toThrow(
    "Unsupported job wire version",
  );
  expect(() => encodeTaskOutput(undefined, 0)).toThrow("Wire byte limit");
  expect(() => decodeJobWire({ version: 1, kind: "void" }, 0)).toThrow("Wire byte limit");
});

test("rejects schemas whose canonical projection contains binary values", () => {
  expect(() =>
    defineTask({
      id: "binary-output-task",
      version: "1",
      input: z.object({}),
      output: z.file(),
      handler: async () => new File(["value"], "value.txt"),
    } as never),
  ).toThrow("canonical");
  expect(() =>
    defineTask({
      id: "binary-input-task",
      version: "1",
      input: z.file(),
      output: z.number(),
      handler: async () => 1,
    } as never),
  ).toThrow("canonical");
});
