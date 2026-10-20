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
  expect(calls).toBe(181);
});

test("an accepted publish may become visible beyond the previous five-minute retry window", async () => {
  let calls = 0;
  await verifyPublishedPackages(
    [packages[0]!],
    (artifact) => (++calls < 90 ? undefined : artifact.integrity),
    async () => {},
  );
  expect(calls).toBe(90);
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

test("53 packages share propagation waits instead of adding a wait per package", async () => {
  const train = Array.from({ length: 53 }, (_, index) => ({
    name: `@relkit/package-${index}`,
    version: "1.0.0",
    integrity: `sha512-${index}`,
  }));
  const attempts = new Map<string, number>();
  let pauses = 0;
  await verifyPublishedPackages(
    train,
    (artifact) => {
      const attempt = (attempts.get(artifact.name) ?? 0) + 1;
      attempts.set(artifact.name, attempt);
      return attempt < 90 ? undefined : artifact.integrity;
    },
    async () => {
      pauses++;
    },
  );
  expect(pauses).toBe(89);
});

test("a missing first package cannot hide another package's immutable conflict", async () => {
  await expect(
    verifyPublishedPackages(
      packages,
      (artifact) => (artifact.name === "relkit" ? "sha512-conflict" : undefined),
      async () => {},
    ),
  ).rejects.toThrow("integrity mismatch: relkit@0.7.6");
});

test("slow registry requests consume one wall clock budget for the whole train", async () => {
  let time = 0;
  await expect(
    verifyPublishedPackages(
      packages,
      () => {
        time += 100_000;
        return undefined;
      },
      async () => {},
      () => time,
    ),
  ).rejects.toThrow("unavailable");
  expect(time).toBeLessThanOrEqual(1_000_000);
});
