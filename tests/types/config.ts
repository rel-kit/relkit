import { defineConfig } from "@zsys/app/config";
import { defineEnv, env } from "@zsys/config";

defineConfig({
  server: {
    port: 3000,
    maxBodyBytes: 1_048_576,
    apiDocs: { enabledInProduction: false },
  },
  inspector: { port: 3210 },
});

// @ts-expect-error PORT belongs to framework server configuration
defineEnv({ PORT: env.port() });

// @ts-expect-error source discovery is fixed by convention
defineConfig({ source: ["lib/**/*.ts"] });

defineConfig({
  server: {
    // @ts-expect-error server settings are closed
    host: "127.0.0.1",
  },
});
