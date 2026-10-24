/** Retained baseline artifacts must remain the exact measured bytes. */
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { verifyConsumerArchive } from "../consumer-artifact-verification.js";

const bytes = Buffer.from("exact packed candidate");
const sha512 = createHash("sha512").update(bytes).digest();
const record = {
  name: "fixture",
  file: "fixture.tgz",
  sha256: createHash("sha256").update(bytes).digest("hex"),
  sha512: sha512.toString("hex"),
  integrity: `sha512-${sha512.toString("base64")}`,
};

it("accepts the exact archive and rejects changed bytes or integrity metadata", () => {
  expect(() => verifyConsumerArchive(bytes, record)).not.toThrow();
  expect(() => verifyConsumerArchive(Buffer.from("changed pack"), record)).toThrow(
    "digest mismatch",
  );
  expect(() => verifyConsumerArchive(bytes, { ...record, integrity: "sha512-wrong" })).toThrow(
    "digest mismatch",
  );
});
