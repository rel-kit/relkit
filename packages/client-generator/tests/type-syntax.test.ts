import { Effect } from "effect";
import { expect, test } from "vitest";
import {
  renderReadonlyTypeTupleEffect,
  renderTypeApplicationEffect,
  renderTypeIntersectionEffect,
  renderTypeObjectEffect,
  renderTypePropertyEffect,
  renderTypeUnionEffect,
} from "../src/generate-type-syntax.js";
test("type syntax Effects cover empty and modified declarations", () => {
  expect(Effect.runSync(renderTypePropertyEffect("id", "string"))).toBe("readonly id: string");
  expect(
    Effect.runSync(renderTypePropertyEffect("id", "string", { readonly: false, optional: true })),
  ).toBe("id?: string");
  expect(Effect.runSync(renderTypeObjectEffect(["readonly id: string"]))).toBe(
    "{ readonly id: string }",
  );
  expect(Effect.runSync(renderTypeObjectEffect([]))).toBe("{}");
  expect(Effect.runSync(renderTypeUnionEffect(["string", "number"]))).toBe("string | number");
  expect(Effect.runSync(renderTypeUnionEffect([]))).toBe("never");
  expect(Effect.runSync(renderTypeApplicationEffect("Array", ["string"]))).toBe("Array<string>");
  expect(Effect.runSync(renderTypeIntersectionEffect("A", "B"))).toBe("A & B");
  expect(Effect.runSync(renderReadonlyTypeTupleEffect(["string"]))).toBe("readonly [string]");
});
