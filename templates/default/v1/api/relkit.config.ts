import { defineConfig, eventBridge, managed } from "@relkit/app/config";
import env from "@app/env.js";

export default defineConfig({
  env,
  events: {
    default: managed(
      eventBridge({
        region: env.EVENT_REGION,
        endpoint: env.EVENT_ENDPOINT,
        busName: env.EVENT_BUS_NAME,
      }),
    ),
  },
  telemetry: { bodyCapture: { mode: "off" } },
  server: { port: 3000, maxBodyBytes: 1_048_576 },
  inspector: { port: 3210 },
  deployment: { target: "aws", adapter: "pulumi" },
});
