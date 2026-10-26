/** Local telemetry works without a remote exporter or extra environment secrets. */
import { defineApp, defineEnv } from "@relkit/app/config";

export default defineApp({
  env: defineEnv({}),
  telemetry: {
    redaction: { mode: "development-redacted", maxBytes: 65_536 },
    localRetention: { maxRecords: 2_000, maxAgeMs: 3_600_000, maxBytes: 16_777_216 },
  },
});
