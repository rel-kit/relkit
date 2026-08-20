import { defineConfig } from "@zsys/app/config";

export default defineConfig({
  server: { port: 3000, maxBodyBytes: 1_048_576 },
  inspector: { port: 3210 },
});
