import "@relkit/pulumi";
import { defineApp, defineEnv } from "@relkit/app/config";
import { aws } from "@relkit/aws";
import { s3 } from "@relkit/s3";

export default defineApp({
  env: defineEnv({}),
  bucket: { receipts: aws(s3(), { versioning: true }) },
  defaults: { bucket: "receipts" },
  deployment: { engine: "pulumi", host: "aws" },
});
