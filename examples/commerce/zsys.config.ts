import { defineConfig } from "@zsys/app/config";

export default defineConfig({
  deployment: { target: "aws", adapter: "pulumi" },
  server: {
    port: 3000,
    maxBodyBytes: 1_048_576,
    apiDocs: { enabledInProduction: false },
  },
  inspector: { port: 3210 },
});
