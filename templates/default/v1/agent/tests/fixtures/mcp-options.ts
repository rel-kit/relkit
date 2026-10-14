/** Checks mcp-options.ts through the supported public RELKIT APIs. */
// #region private-tool
import hello from "@app/services/hello/functions/hello.function.js";

export const privateLookup = hello.asTool({
  id: "hello.private-lookup",
  description: "Read a greeting inside this app only",

  sideEffect: "read",
  approval: "never",
  timeoutMs: 2_000,
  mcp: false,
});
// #endregion private-tool

import { defineApp } from "@relkit/app/config";
import env from "@app/platform/env.js";

export const mcpDisabled = defineApp({
  env,
  // #region disable-mcp
  server: {
    port: 3000,
    mcp: false,
  },
  // #endregion disable-mcp
});
