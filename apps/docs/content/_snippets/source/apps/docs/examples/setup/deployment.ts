/** Select AWS hosting and Pulumi without provisioning resources during import. */
import "@relkit/aws";
import "@relkit/pulumi";
import { defineApp, defineEnv } from "@relkit/app/config";

export default defineApp({
  env: defineEnv({}),
  deployment: { engine: "pulumi", host: "aws" },
});
