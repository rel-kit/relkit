/** Native fixture source bytes for account-free migration and preservation checks. */
import { join } from "node:path";

/**
 * Supplies a small public-descriptor application and private state sentinels.
 * @param repository - Installed toolchain root.
 * @returns Authored files and protected bytes for a temporary test application.
 */
export function migrationFixtureFiles(repository: string) {
  return {
    "package.json": JSON.stringify({
      name: "layout-migration-test",
      type: "module",
      scripts: {
        typecheck: `bun ${join(repository, "node_modules/typescript/bin/tsc")} --noEmit`,
      },
    }),
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        strict: true,
        skipLibCheck: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ESNext",
        types: ["bun"],
        noEmit: true,
      },
      include: ["src", "relkit.config.ts", ".relkit/generated/*.d.ts"],
    }),
    "relkit.config.ts":
      'import { defineApp, defineEnv } from "@relkit/app";\nexport default defineApp({ id: "layout-migration-test", env: defineEnv({}) });\n',
    "src/hello/service.ts":
      'import { defineService } from "@relkit/app";\nimport hello from "./functions/hello.function.js";\nexport default defineService({ functions: { hello } });\n',
    "src/hello/functions/hello.function.ts":
      'import { defineFunction } from "@relkit/app";\nimport { z } from "@relkit/schema";\nexport default defineFunction({ input: z.object({}), output: z.string(), handler: async () => "hello" });\n',
    "src/hello/assets/message.bin": "asset-byte-sentinel",
    "src/routes/route.ts":
      'import { defineRoute } from "@relkit/app";\nimport hello from "../hello/service.js";\nexport const GET = defineRoute({ target: hello.hello });\n',
    ".relkit/state/sentinel": "state-byte-sentinel",
    ".relkit/observability/sentinel": "observability-byte-sentinel",
    "migrations/sentinel.sql": "migration-byte-sentinel",
    "bun.lock": "lock-byte-sentinel",
    ".env.local": "SECRET=credential-byte-sentinel",
    ".npmrc": "//registry.example.test/:_authToken=registry-credential-sentinel",
    ".aws/credentials": "[fixture]\naws_secret_access_key=profile-credential-sentinel",
    ".relkit/provider-profiles/sentinel": "provider-profile-byte-sentinel",
  };
}
