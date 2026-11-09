/** Exposes the greeting function to agents and MCP clients as a read-only tool. */
import hello from "./hello.function.js";

export default hello.asTool({
  id: "hello.lookup",
  description: "Read a greeting for a supplied name",
  sideEffect: "read",
  approval: "never",
  timeoutMs: 2_000,
});
