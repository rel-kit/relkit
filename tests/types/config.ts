import { defineConfig } from "@zsys/app/config";
import { external, s3 } from "@zsys/app";
import { defineEnv, env } from "@zsys/config";

defineConfig({
  env: defineEnv({}),
  server: {
    port: 3000,
    maxBodyBytes: 1_048_576,
    apiDocs: { enabledInProduction: false },
  },
  inspector: { port: 3210 },
});

const unified = defineConfig({
  env: defineEnv({}),
  buckets: {
    assets: external(s3({ endpoint: "http://localhost", bucketName: "assets", region: "local" })),
  },
  defaults: { bucket: "assets" },
});
const bucketDefault: "assets" | undefined = unified.defaults?.bucket;
void bucketDefault;

defineConfig({
  env: defineEnv({}),
  buckets: {
    assets: external(s3({ endpoint: "http://localhost", bucketName: "assets", region: "local" })),
  },
  // @ts-expect-error defaults reference keys in the corresponding plural map
  defaults: { bucket: "missing" },
});

defineConfig({
  env: defineEnv({}),
  // @ts-expect-error provider maps are top-level
  providers: {},
});

// @ts-expect-error PORT belongs to framework server configuration
defineEnv({ PORT: env.port() });

// @ts-expect-error source discovery is fixed by convention
defineConfig({ env: defineEnv({}), source: ["lib/**/*.ts"] });

defineConfig({
  env: defineEnv({}),
  server: {
    // @ts-expect-error server settings are closed
    host: "127.0.0.1",
  },
});
