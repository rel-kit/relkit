import { defineConfig } from "@relkit/app/config";
import env from "@app/platform/env.js";

export default defineConfig({
  env,
  telemetry: { bodyCapture: { mode: "off" } },
  server: { port: 3000, maxBodyBytes: 1_048_576 },
  inspector: { port: 3210 },
  deployment: { target: "aws", adapter: "pulumi" },
});
