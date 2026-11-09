/** Local MinIO supplies connection values without application-owned credentials. */
import { defineApp, defineEnv } from "relkit/config";
import { docker } from "@relkit/docker";
import { s3 } from "@relkit/s3";

export default defineApp({
  env: defineEnv({}),
  bucket: { assets: docker(s3()) },
  defaults: { bucket: "assets" },
});
