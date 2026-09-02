import { expect, test } from "bun:test";

const integrations = [
  "redis",
  "s3",
  "docker",
  "local",
  "cloudflare",
  "ai-sdk",
  "sentry",
  "otlp",
  "aws",
  "pulumi",
] as const;

test("subpaths re-export the standalone authoring modules exactly", async () => {
  for (const name of integrations) {
    const catalog = await import(`./src/${name}.ts`);
    const standalone = await import(`@relkit/${name}`);
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(standalone).sort());
    for (const key of Object.keys(standalone)) expect(catalog[key]).toBe(standalone[key]);
  }
});
