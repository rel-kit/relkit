import hello from "@app/services/hello/functions/hello.function.js";

export const privateLookup = hello.asTool({
  id: "hello.private-lookup",
  description: "Read a greeting inside this app only",

  sideEffect: "read",
  approval: "never",
  timeoutMs: 2_000,
  mcp: false,
});
