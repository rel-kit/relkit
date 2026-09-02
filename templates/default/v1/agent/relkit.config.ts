import { aiSdk } from "@relkit/ai-sdk";
import { defineApp, env as binding } from "@relkit/app/config";
import env from "@app/platform/env.js";
// relkit:create:deployment-imports

export default defineApp({
  env,
  model: {
    openai: aiSdk({
      provider: "openai",
      defaultModel: "gpt-5-mini",
      apiKey: binding.secret("OPENAI_API_KEY"),
    }),
    anthropic: aiSdk({
      provider: "anthropic",
      defaultModel: "claude-sonnet-4-5",
      apiKey: binding.secret("ANTHROPIC_API_KEY"),
    }),
  },
  defaults: { model: "openai" },
  telemetry: { redaction: { mode: "development-redacted", maxBytes: 65_536 } },
  server: { port: 3000, maxBodyBytes: 1_048_576 },
  inspector: { port: 3210 },
  // relkit:create:deployment
});
