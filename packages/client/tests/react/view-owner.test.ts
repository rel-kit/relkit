import { expect, it } from "vitest";
import { borrowViewOwner } from "../../src/react/view-owner.js";

it("development setup replay renews an owner, while replacement retires both owners", async () => {
  const leases = new WeakMap<object, object>();
  const first = {};
  const second = {};
  let firstCloses = 0;
  let secondCloses = 0;
  const cleanup = borrowViewOwner(first, () => firstCloses++, leases);
  cleanup();
  const renewed = borrowViewOwner(first, () => firstCloses++, leases);
  await Promise.resolve();
  expect(firstCloses).toBe(0);
  const other = borrowViewOwner(second, () => secondCloses++, leases);
  renewed();
  other();
  await Promise.resolve();
  expect(firstCloses).toBe(1);
  expect(secondCloses).toBe(1);
  expect(leases.has(first)).toBe(false);
  expect(leases.has(second)).toBe(false);
});
