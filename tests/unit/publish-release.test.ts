import { expect, test } from "bun:test";
import { verifyPublishedPackages } from "../../scripts/publish-release.ts";

const packages = [
  { name: "@relkit/cli", version: "0.7.6", integrity: "sha512-cli" },
  { name: "relkit", version: "0.7.6", integrity: "sha512-wrapper" },
];

test("every package must be present with the actual release artifact integrity", async () => {
  const checked: string[] = [];
  await verifyPublishedPackages(packages, (artifact) => {
    checked.push(artifact.name);
    return artifact.integrity;
  });
  expect(checked).toEqual(packages.map((artifact) => artifact.name));
});

test("registry propagation is retried within a finite bound", async () => {
  let calls = 0,
    pauses = 0;
  await verifyPublishedPackages(
    [packages[0]!],
    (artifact) => (++calls < 3 ? undefined : artifact.integrity),
    async () => {
      pauses++;
    },
  );
  expect(calls).toBe(3);
  expect(pauses).toBe(2);
});

test("a partially published train fails instead of reporting a complete release", async () => {
  let calls = 0;
  await expect(
    verifyPublishedPackages(
      packages,
      (artifact) => {
        calls++;
        return artifact.name === "relkit" ? undefined : artifact.integrity;
      },
      async () => {},
    ),
  ).rejects.toThrow("relkit@0.7.6");
  expect(calls).toBe(61);
});

test("an immutable registry integrity mismatch fails immediately", async () => {
  let pauses = 0;
  await expect(
    verifyPublishedPackages(
      packages,
      () => "sha512-wrong",
      async () => {
        pauses++;
      },
    ),
  ).rejects.toThrow("integrity mismatch");
  expect(pauses).toBe(0);
});
