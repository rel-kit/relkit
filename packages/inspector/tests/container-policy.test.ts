/** Container launch rejects ephemeral history, file-only credentials and root ownership. */
import { expect, test } from "vitest";
import { parseInspectorOptions } from "../src/options.js";
import { validateInspectorContainer } from "../src/container-policy.js";

const options = parseInspectorOptions([
  "--connection-file",
  "/connections/session.json",
  "--history-directory",
  "/history",
]);
const mounts =
  "40 20 0:1 / /connections ro,relatime - virtiofs connection ro\n41 20 0:2 / /history rw,relatime - ext4 volume rw";

test("image health and the container UI use the fixed internal port", () => {
  expect(() => validateInspectorContainer({ ...options, port: 3211 }, 501, mounts)).toThrow("3210");
});

test("requires a non-root reader, read-only directory and persistent writable history", () => {
  expect(() => validateInspectorContainer(options, 501, mounts)).not.toThrow();
  expect(() => validateInspectorContainer(options, 0, mounts)).toThrow("non-root");
  expect(() => validateInspectorContainer(parseInspectorOptions([]), 501, mounts)).toThrow(
    "explicit",
  );
  expect(() =>
    validateInspectorContainer(options, 501, mounts.replace("/connections ro", "/connections rw")),
  ).toThrow("read-only directory");
  expect(() =>
    validateInspectorContainer(
      options,
      501,
      mounts.replace("/connections ro", "/connections/session.json ro"),
    ),
  ).toThrow("read-only directory");
  expect(() =>
    validateInspectorContainer(options, 501, mounts.replace("- ext4 volume", "- tmpfs volume")),
  ).toThrow("persistent");
  expect(() =>
    validateInspectorContainer(options, 501, mounts.replace("/history rw", "/history ro")),
  ).toThrow("persistent");
});

test("each separately selected credential directory must also be mounted read-only", () => {
  const selected = { ...options, credentialFile: "/credentials/session.json" };
  expect(() => validateInspectorContainer(selected, 501, mounts)).toThrow("read-only directory");
  expect(() =>
    validateInspectorContainer(
      selected,
      501,
      mounts + "\n42 20 0:3 / /credentials ro - ext4 credential ro",
    ),
  ).not.toThrow();
});
