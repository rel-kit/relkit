# @relkit/app

`@relkit/app` is the public entry point for application configuration and descriptors. Provider
implementations live in independently installable integration packages.

```ts
import "@relkit/pulumi";
import { defineApp, defineEnv, env as binding } from "@relkit/app/config";
import { aws } from "@relkit/aws";
import { docker } from "@relkit/docker";
import { redis } from "@relkit/redis";
import { s3 } from "@relkit/s3";

export default defineApp({
  env: defineEnv({}),
  cache: {
    requests: docker(redis({ url: binding.secret("REQUESTS_REDIS_URL") })),
    timeline: aws(redis(), { engine: "valkey" }),
  },
  bucket: { receipts: aws(s3(), { versioning: true }) },
  defaults: { cache: "requests", bucket: "receipts" },
  deployment: { engine: "pulumi", host: "aws" },
  server: { port: 3000 },
  inspector: { port: 3210 },
});
```

Direct adapters describe connected services. `docker(adapter)` adds a local development recipe, and
`aws(adapter)` makes AWS own that resource in deployment. Named binding values are private to their
provider binding and do not become handler-visible `ctx.env` fields.

Cloud and deployment default to `none`. Tests provide replacements explicitly by capability and
profile; environment names never swap providers.
