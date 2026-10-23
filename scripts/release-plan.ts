/** Validates independently versioned release plans and enumerates the creator's selected provider catalog. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type ReleasePlan = {
  protocol: "relkit.release-plan.v1";
  version: string;
  packages: { name: string; version: string }[];
};

/** Optional packages embedded in the generator, outside its runtime dependency graph. */
export const generatorProviders = [
  "@relkit/aws",
  "@relkit/pulumi",
  "@relkit/docker",
  "@relkit/local",
  "@relkit/langchain",
  "@relkit/inngest",
  "@relkit/trigger",
  "@relkit/effect-mq",
  "@relkit/better-auth",
  "@relkit/cloudflare",
  "@relkit/drizzle",
  "@relkit/redis",
  "@relkit/s3",
] as const;

/** The root release number identifies a batch independently of individual package versions. */
export function nextReleaseVersion(changelog: string): string {
  const previous = /^## (\d+)\.(\d+)\.(\d+)(?:\s|$)/m.exec(changelog);
  assert.ok(previous, "CHANGELOG.md has no previous release version");
  return `${previous[1]}.${previous[2]}.${Number(previous[3]) + 1}`;
}

export function validateReleasePlan(value: unknown): ReleasePlan {
  assert.ok(value && typeof value === "object");
  const plan = value as ReleasePlan;
  assert.equal(plan.protocol, "relkit.release-plan.v1");
  assert.match(plan.version, /^\d+\.\d+\.\d+$/);
  assert.ok(Array.isArray(plan.packages) && plan.packages.length > 0);
  const names = new Set<string>();
  for (const item of plan.packages) {
    assert.match(item.name, /^(?:@relkit\/[a-z0-9-]+|create-relkit|relkit)$/);
    assert.match(item.version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
    assert.ok(!names.has(item.name), `Duplicate release package: ${item.name}`);
    names.add(item.name);
  }
  return plan;
}

export async function readReleasePlan(root: string): Promise<ReleasePlan | undefined> {
  try {
    return validateReleasePlan(
      JSON.parse(await readFile(join(root, ".changeset/release.json"), "utf8")),
    );
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw cause;
  }
}

/** Reject stale plans rather than packing a different version under a reviewed release. */
export function selectReleasePackages<T extends { name: string; manifest: { version?: unknown } }>(
  items: readonly T[],
  plan: ReleasePlan,
): T[] {
  return plan.packages.map((entry) => {
    const item = items.find((item) => item.name === entry.name);
    assert.ok(item, `Release package is absent: ${entry.name}`);
    assert.equal(item.manifest.version, entry.version, `Release version changed: ${entry.name}`);
    return item;
  });
}
