/** Exposes the hello function as a read-only greeting tool with its existing two-second timeout. */
import hello from "@app/services/hello/functions/hello.function.js";

export default hello.asTool({
  id: "hello.lookup",
  description: "Read a greeting for a supplied name",

  sideEffect: "read",
  approval: "never",
  timeoutMs: 2_000,
});
