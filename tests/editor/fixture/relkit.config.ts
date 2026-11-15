/** Application of the editor fixture: several profiles for one capability, one adapter for another. */
import { defineApp, env as binding } from "relkit/config";
import { docker } from "@relkit/docker";
import { inngest } from "@relkit/inngest";
import { localEvent, localRealtime } from "@relkit/local";
import { otlp } from "@relkit/otlp";
import { redis } from "@relkit/redis";
import { s3 } from "@relkit/s3";
import env from "./env.js";

export default defineApp({
  id: "editor-fixture",
  env,
  bucket: { uploads: docker(s3()), archive: docker(s3()) },
  cache: docker(redis({ url: binding.secret("CACHE_URL") })),
  event: { local: localEvent() },
  realtime: localRealtime(),
  jobs: { background: docker(inngest()) },
  defaults: { bucket: "uploads", cache: "default", event: "local", jobs: "background" },
  telemetry: {
    redaction: { mode: "development-redacted", maxBytes: 65_536 },
    exporters: { traces: otlp({ endpoint: binding.url("OTLP_ENDPOINT"), serviceName: "fixture" }) },
  },
  server: { port: 4000, maxBodyBytes: 1_048_576, apiDocs: { ui: "scalar" } },
  inspector: { enabled: true },
});
