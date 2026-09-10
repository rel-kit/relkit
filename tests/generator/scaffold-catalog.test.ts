import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SCAFFOLD_DEPENDENCIES } from "../../packages/create-relkit/src/index.ts";

const OWNERS = {
  "@relkit/aws": "integrations/packages/aws/package.json",
  "@relkit/better-auth": "packages/better-auth/package.json",
  "@relkit/cloudflare": "integrations/packages/cloudflare/package.json",
  "@relkit/docker": "integrations/packages/docker/package.json",
  "@relkit/drizzle": "packages/drizzle/package.json",
  "@relkit/local": "integrations/packages/local/package.json",
  "@relkit/pulumi": "integrations/packages/pulumi/package.json",
  "@relkit/redis": "integrations/packages/redis/package.json",
  "@relkit/s3": "integrations/packages/s3/package.json",
  "better-auth": "packages/better-auth/package.json",
  "drizzle-kit": "examples/auth-drizzle/package.json",
  "drizzle-orm": "packages/drizzle/package.json",
  langchain: "packages/agents/package.json",
} as const;

test("keeps scaffold dependency versions aligned with owning manifests", async () => {
  for (const [name, dependency] of Object.entries(SCAFFOLD_DEPENDENCIES)) {
    const manifest = JSON.parse(
      await readFile(join(import.meta.dir, "../..", OWNERS[name as keyof typeof OWNERS]), "utf8"),
    );
    const actual =
      manifest.name === name
        ? manifest.version
        : (manifest.dependencies?.[name] ?? manifest.devDependencies?.[name]);
    expect(actual, `${name} in ${OWNERS[name as keyof typeof OWNERS]}`).toBe(dependency.version);
  }
});
