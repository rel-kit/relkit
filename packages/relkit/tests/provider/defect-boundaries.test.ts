import { expect, test, vi } from "vitest";
vi.mock("../../src/contracts/index.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/contracts/index.js")>();
  return {
    ...original,
    normalizeId: (value: unknown) => {
      if (value === "__id_defect__") throw new Error("unexpected ID failure");
      return original.normalizeId(value);
    },
    serializeJson: (value: unknown) => {
      if (value !== null && typeof value === "object" && "__json_defect__" in value)
        throw new Error("unexpected JSON failure");
      return original.serializeJson(value);
    },
  };
});
import { ProviderInputError } from "../../src/provider/provider-compat-errors.js";
import {
  providerNormalizeId,
  providerSerializeJson,
} from "../../src/provider/protocol-builder-utils.js";
import { isConfigured } from "../../src/provider/source-validation.js";
test("only documented contract validation failures become provider input errors", () => {
  expect(() => providerNormalizeId("")).toThrow(ProviderInputError);
  expect(() => providerSerializeJson(undefined)).toThrow(ProviderInputError);
  expect(() => providerNormalizeId("__id_defect__")).toThrow("unexpected ID failure");
  expect(() => providerSerializeJson({ __json_defect__: true })).toThrow("unexpected JSON failure");
});
test("source configuration checks preserve unexpected defects", () => {
  const unexpected = new Error("unexpected contract getter");
  const malformed = {
    get connectionContract() {
      throw unexpected;
    },
  } as never;
  expect(() => isConfigured(malformed)).toThrow(unexpected);
});
