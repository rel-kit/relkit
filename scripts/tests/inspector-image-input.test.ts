import { expect, test } from "bun:test";
import { inspectorImageInput } from "../inspector-image-input.js";

const tool = {
  name: "@relkit/inspector",
  version: "0.1.0",
  file: "relkit-inspector-0.1.0.tgz",
  sha256: "a".repeat(64),
};
test("image inputs retain exact local candidate authority without workspace fallback", () => {
  const input = inspectorImageInput({ packages: [tool] });
  expect(input.manifest.dependencies).toEqual({
    "@relkit/inspector": "file:./artifacts/relkit-inspector-0.1.0.tgz",
  });
  expect(input.manifest.overrides["@relkit/inspector"]).toBe(
    "file:./artifacts/relkit-inspector-0.1.0.tgz",
  );
});
test("image inputs reject traversal, duplicate identities and absent tool", () => {
  expect(() => inspectorImageInput({ packages: [{ ...tool, file: "../foreign.tgz" }] })).toThrow();
  expect(() => inspectorImageInput({ packages: [{ ...tool, sha256: "invalid" }] })).toThrow();
  expect(() => inspectorImageInput({ packages: [tool, tool] })).toThrow("Duplicate");
  expect(() => inspectorImageInput({ packages: [] })).toThrow("required");
});
