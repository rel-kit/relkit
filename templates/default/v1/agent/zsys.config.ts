import { aiSdk, defineConfig, external } from "@zsys/app";
import env from "./src/env.js";

export default defineConfig({
  env,
  models: {
    default: external(
      aiSdk({
        defaultProvider: "openai",
        defaultModel: "gpt-5-mini",
        openai: { apiKey: env.OPENAI_API_KEY },
        anthropic: {
          defaultModel: "claude-sonnet-4-5",
          apiKey: env.ANTHROPIC_API_KEY,
        },
      }),
    ),
  },
  telemetry: { bodyCapture: { mode: "off" } },
  server: { port: 3000, maxBodyBytes: 1_048_576 },
  inspector: { port: 3210 },
  deployment: { target: "aws", adapter: "pulumi" },
});
